import { createContext } from './context';
import { coreHandlers } from './handlers';
import type { JobContext, JobHandlers } from './types';
import type { RegionSource } from '../world/source';

/**
 * Call this from a worker script: `installChunkWorker(self, extraHandlers)`.
 * It answers the pool's `init` and `job` messages with the core handlers plus any you add.
 */
export function installChunkWorker(
    scope: { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown, t?: Transferable[]): void },
    extra: JobHandlers = {}
) {
    const handlers = { ...coreHandlers, ...extra };
    const pendingSettings: [string, unknown][] = [];
    let ctx: JobContext | null = null;
    scope.onmessage = async (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'configure') {
            if (ctx) ctx.settings[m.key] = m.value;
            else pendingSettings.push([m.key, m.value]);
            return;
        }
        if (m.type === 'init') {
            ctx = createContext(m.source as RegionSource);
            for (const [k, v] of pendingSettings.splice(0)) ctx.settings[k] = v;
            return;
        }
        try {
            if (!ctx) throw new Error('Worker used before init');
            const h = handlers[m.kind];
            if (!h) throw new Error(`No handler for job "${m.kind}"`);
            const { result, transfer } = await h(ctx, m.params);
            scope.postMessage({ id: m.id, ok: true, result }, transfer ?? []);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            scope.postMessage({ id: m.id, ok: false, error: error.message, name: error.name });
        }
    };
}
