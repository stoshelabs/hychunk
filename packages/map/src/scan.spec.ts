import { describe, expect, it } from 'vitest';
import { ScanQueue, type ViewRect } from './scan';

const view = (cx: number, cz: number, half = 5): ViewRect => ({
    cx,
    cz,
    c0: cx - half,
    r0: cz - half,
    c1: cx + half,
    r1: cz + half
});
const drain = (q: ScanQueue, v: ViewRect) => {
    const out = [];
    for (let it = q.next(v, 0); it; it = q.next(v, 0)) out.push(it);
    return out;
};
const grid = (n: number, ox = 0, oz = 0) =>
    Array.from({ length: n * n }, (_, i) => ({ cx: ox + (i % n), cz: oz + Math.floor(i / n) }));

describe('ScanQueue', () => {
    it('reads every chunk once, coarse passes before fine ones', () => {
        const q = new ScanQueue();
        q.load(grid(16));
        expect(q.size).toBe(256);
        const out = drain(q, view(8, 8));
        expect(out).toHaveLength(256);
        expect(new Set(out.map((c) => `${c.cx},${c.cz}`)).size).toBe(256);
        const strides = out.map((c) => c.stride);
        expect(strides).toEqual([...strides].sort((a, b) => b - a)); // 4s, then 2s, then 1s
        expect(strides.filter((s) => s === 4)).toHaveLength(16); // every 4th chunk of a 16×16 area
        expect(q.size).toBe(0);
    });

    it('starts with what is on screen', () => {
        const q = new ScanQueue();
        q.load([...grid(8, 0, 0), ...grid(8, 200, 200)]);
        const first = q.next(view(204, 204, 4), 0)!;
        expect(first.cx).toBeGreaterThanOrEqual(200);
        expect(first.cz).toBeGreaterThanOrEqual(200);
    });

    it('follows the view when it moves far away', () => {
        const q = new ScanQueue();
        q.load([...grid(8, 0, 0), ...grid(8, 200, 200)]);
        q.next(view(4, 4, 4), 0);
        const after = q.next(view(204, 204, 4), 1000)!; // later, and far away
        expect(after.cx).toBeGreaterThanOrEqual(200);
    });

    it('copes with a very large world without sorting all of it', () => {
        const q = new ScanQueue();
        const t = performance.now();
        q.load(grid(400)); // 160 000 chunks
        for (let i = 0; i < 2000; i++) q.next(view(200 + (i % 50), 200, 8), i * 250);
        expect(performance.now() - t).toBeLessThan(3000);
    });
});
