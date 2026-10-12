import { createContext } from './context';
import { coreHandlers } from './handlers';
import type { ChunkPool, Job, JobHandlers, RegionSource } from './types';

interface Pending {
    id: number;
    kind: string;
    params: unknown;
    priority: number;
    resolve(v: any): void;
    reject(e: unknown): void;
    cancelled: boolean;
}

/** Runs queued jobs, lowest priority number first, up to `size` at a time. */
abstract class Queue implements ChunkPool {
    private pending: Pending[] = [];
    private running = 0;
    private nextId = 1;
    private dead = false;
    constructor(readonly size: number) {}

    run<R>(kind: string, params: unknown, priority = 0): Job<R> {
        let item!: Pending;
        const promise = new Promise<R>((resolve, reject) => {
            item = { id: this.nextId++, kind, params, priority, resolve, reject, cancelled: false };
        });
        if (this.dead) item.reject(new Error('Pool destroyed'));
        else {
            // Keep the queue ordered so the front is always the most wanted.
            let i = this.pending.length;
            while (i > 0 && this.pending[i - 1]!.priority > priority) i--;
            this.pending.splice(i, 0, item);
            queueMicrotask(() => this.pump());
        }
        return {
            promise,
            cancel: () => {
                item.cancelled = true;
                const at = this.pending.indexOf(item);
                if (at >= 0) {
                    this.pending.splice(at, 1);
                    item.reject(new DOMException('Cancelled', 'AbortError'));
                }
            }
        };
    }

    private pump() {
        while (!this.dead && this.running < this.size && this.pending.length) {
            const item = this.pending.shift()!;
            this.running++;
            this.start(item)
                .then(
                    (v) => item.resolve(v),
                    (e) => item.reject(e)
                )
                .finally(() => {
                    this.running--;
                    this.pump();
                });
        }
    }

    protected abstract start(item: Pending): Promise<unknown>;
    abstract configure(key: string, value: unknown): void;
    protected stop() {}

    destroy() {
        this.dead = true;
        for (const p of this.pending) p.reject(new Error('Pool destroyed'));
        this.pending = [];
        this.stop();
    }
}

class InlinePool extends Queue {
    private ctx;
    constructor(
        source: RegionSource,
        private handlers: JobHandlers
    ) {
        super(1);
        this.ctx = createContext(source);
    }
    configure(key: string, value: unknown) {
        this.ctx.settings[key] = value;
    }
    protected async start(item: Pending) {
        const h = this.handlers[item.kind];
        if (!h) throw new Error(`No handler for job "${item.kind}"`);
        return (await h(this.ctx, item.params)).result;
    }
}

/** Runs jobs on the calling thread, one at a time. For tests, Node, and when workers are not available. */
export function createInlinePool(source: RegionSource, handlers: JobHandlers = coreHandlers): ChunkPool {
    return new InlinePool(source, { ...coreHandlers, ...handlers });
}

type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; name: string };

class WorkerPool extends Queue {
    private workers: { worker: Worker; busy: Map<number, Pending> }[] = [];
    private idle: number[] = [];
    private waiting: ((i: number) => void)[] = [];

    constructor(source: RegionSource, factory: () => Worker, size: number) {
        super(size);
        for (let i = 0; i < size; i++) {
            const worker = factory();
            const slot = { worker, busy: new Map<number, Pending>() };
            worker.onmessage = (e: MessageEvent<Reply>) => {
                const m = e.data;
                const item = slot.busy.get(m.id);
                if (!item) return;
                slot.busy.delete(m.id);
                this.idle.push(i);
                this.waiting.shift()?.(this.idle.pop()!);
                if (m.ok) (item as any).done(m.result);
                else {
                    const err = new Error(m.error);
                    err.name = m.name;
                    (item as any).fail(err);
                }
            };
            worker.postMessage({ type: 'init', source });
            this.workers.push(slot);
            this.idle.push(i);
        }
    }

    protected start(item: Pending) {
        return new Promise<unknown>((resolve, reject) => {
            const take = (i: number) => {
                const slot = this.workers[i]!;
                (item as any).done = resolve;
                (item as any).fail = reject;
                slot.busy.set(item.id, item);
                slot.worker.postMessage({ type: 'job', id: item.id, kind: item.kind, params: item.params });
            };
            const i = this.idle.pop();
            if (i !== undefined) take(i);
            else this.waiting.push(take);
        });
    }

    configure(key: string, value: unknown) {
        // Messages to one worker arrive in order, so a job posted after this one sees the value.
        for (const { worker } of this.workers) worker.postMessage({ type: 'configure', key, value });
    }

    protected override stop() {
        for (const { worker } of this.workers) worker.terminate();
    }
}

/**
 * Runs jobs in Web Workers, so decoding uses every core and the page stays smooth.
 * `factory` creates a worker whose script calls `installChunkWorker` — the app owns that
 * one-line file, which keeps this library independent of any bundler.
 */
export function createWorkerPool(source: RegionSource, factory: () => Worker, size = defaultPoolSize()): ChunkPool {
    return new WorkerPool(source, factory, size);
}

export function defaultPoolSize() {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    return Math.max(2, Math.min(8, cores - 1));
}
