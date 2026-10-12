import type { StructureSource } from '@hychunk/core';
import type { PrefabTable } from '@hychunk/worldgen';

/**
 * Workers that work out the world's structures for one seed from the data packs. One starts at once; the others join a few
 * seconds later, once the chunk workers have started drawing (they all load the generator, and starting nineteen at the same
 * moment would delay the first tiles). Requests are shared out by square, so a square's structures and caves are in one worker.
 */
export function createStructureSource(
    files: Record<string, unknown>,
    table: PrefabTable | null,
    seed: number,
    count = 3,
    joinAfterMs = 6000
): StructureSource {
    const waiting = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    let id = 0,
        turn = 0,
        disposed = false;
    const workers: Worker[] = [];
    const ready: Promise<boolean>[] = [];
    const call = <T>(worker: Worker, message: Record<string, unknown> | string) =>
        new Promise<T>((resolve, reject) => {
            const n = ++id;
            waiting.set(n, { resolve, reject });
            worker.postMessage({ id: n, ...(typeof message === 'string' ? { type: message } : message) });
        });
    const add = () => {
        if (disposed || workers.length >= count) return;
        const worker = new Worker(new URL('./structures.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
            const w = waiting.get(e.data.id);
            if (!w) return;
            waiting.delete(e.data.id);
            if (e.data.error !== undefined) w.reject(new Error(e.data.error));
            else w.resolve(e.data.result);
        };
        worker.onerror = (e) => {
            for (const w of waiting.values()) w.reject(new Error(e.message || 'The structure worker failed'));
            waiting.clear();
        };
        workers.push(worker);
        ready.push(call<boolean>(worker, { type: 'init', files, table, seed }));
    };
    add();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < count; i++) timers.push(setTimeout(add, joinAfterMs * i));
    // a square goes to the worker its position picks among those running now (a worker that joins later takes squares from then on)
    const forSquare = (x: number, z: number, size: number) =>
        Math.abs(Math.floor(x / size) * 31 + Math.floor(z / size)) % workers.length;
    const both = (kind: 'square' | 'caves') => async (x: number, z: number, size: number) => {
        const i = forSquare(x, z, size);
        await ready[i]!;
        return call(workers[i]!, { type: kind, x, z, size });
    };
    return {
        unique: async () => {
            const i = turn++ % workers.length;
            await ready[i]!;
            return call(workers[i]!, 'unique');
        },
        square: both('square'),
        caves: both('caves'),
        dispose: () => {
            disposed = true;
            timers.forEach(clearTimeout);
            workers.forEach((w) => w.terminate());
            waiting.clear();
        }
    } as StructureSource;
}
