export interface ScanItem {
    cx: number;
    cz: number;
    /** Sampling step of the pass this chunk belongs to: 4, 2 or 1. */
    stride: number;
}

export interface ViewRect {
    cx: number;
    cz: number;
    c0: number;
    r0: number;
    c1: number;
    r1: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const floorDiv = (a: number, n: number) => Math.floor(a / n);
const SORT_EVERY_MS = 200;
const REGION = 32;

interface Bucket {
    rx: number;
    rz: number;
    items: ScanItem[];
    /** Whether `items` is ordered for the view this bucket was last ranked against. */
    rankedFor: { x: number; z: number };
}

/**
 * The chunks still to read for the overview, in three passes — every 4th chunk, then every
 * 2nd, then the rest — so the whole world appears quickly and sharpens after, as in a seed map.
 *
 * Each pass is kept as one bucket per region, so re-ranking after the view moves means sorting
 * regions (hundreds) and one bucket (at most 1024 chunks), never the whole world.
 */
export class ScanQueue {
    private passes: {
        buckets: Map<string, Bucket>;
        order: Bucket[];
        orderedFor: { x: number; z: number };
        orderedAt: number;
    }[] = [];
    private remaining = 0;

    constructor() {
        this.load([]);
    }

    load(chunks: { cx: number; cz: number }[]) {
        this.passes = [0, 1, 2].map(() => ({
            buckets: new Map(),
            order: [],
            orderedFor: { x: Infinity, z: Infinity },
            orderedAt: -Infinity
        }));
        this.remaining = chunks.length;
        for (const { cx, cz } of chunks) {
            const stride = mod(cx, 4) === 0 && mod(cz, 4) === 0 ? 4 : mod(cx, 2) === 0 && mod(cz, 2) === 0 ? 2 : 1;
            const pass = this.passes[stride === 4 ? 0 : stride === 2 ? 1 : 2]!;
            const rx = floorDiv(cx, REGION),
                rz = floorDiv(cz, REGION);
            const k = `${rx}.${rz}`;
            let b = pass.buckets.get(k);
            if (!b) pass.buckets.set(k, (b = { rx, rz, items: [], rankedFor: { x: Infinity, z: Infinity } }));
            b.items.push({ cx, cz, stride });
        }
        for (const pass of this.passes) pass.order = [...pass.buckets.values()];
    }

    get size() {
        return this.remaining;
    }

    next(view: ViewRect, now = performance.now()): ScanItem | undefined {
        for (const pass of this.passes) {
            if (!pass.order.length) continue;
            const moved = Math.hypot(view.cx - pass.orderedFor.x, view.cz - pass.orderedFor.z);
            if (moved > 2 && now - pass.orderedAt > SORT_EVERY_MS) {
                // Regions on screen first, then the nearest.
                const rank = (b: Bucket) => {
                    const x0 = b.rx * REGION,
                        z0 = b.rz * REGION;
                    const inside = x0 + REGION > view.c0 && x0 <= view.c1 && z0 + REGION > view.r0 && z0 <= view.r1;
                    return (inside ? 0 : 1e9) + (x0 + REGION / 2 - view.cx) ** 2 + (z0 + REGION / 2 - view.cz) ** 2;
                };
                pass.order.sort((a, b) => rank(a) - rank(b));
                pass.orderedFor = { x: view.cx, z: view.cz };
                pass.orderedAt = now;
            }
            const head = pass.order[0]!;
            if (Math.hypot(view.cx - head.rankedFor.x, view.cz - head.rankedFor.z) > 2) {
                // Inside this region, what is on screen goes first, then the nearest; the best are at the end so `pop` is cheap.
                const rank = (it: ScanItem) => {
                    const inside = it.cx >= view.c0 && it.cx <= view.c1 && it.cz >= view.r0 && it.cz <= view.r1;
                    return (inside ? 0 : 1e9) + (it.cx - view.cx) ** 2 + (it.cz - view.cz) ** 2;
                };
                head.items.sort((a, b) => rank(b) - rank(a));
                head.rankedFor = { x: view.cx, z: view.cz };
            }
            const item = head.items.pop()!;
            this.remaining--;
            if (!head.items.length) {
                pass.order.shift();
                pass.buckets.delete(`${head.rx}.${head.rz}`);
            }
            return item;
        }
        return undefined;
    }
}
