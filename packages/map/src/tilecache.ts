import { REGION_SIZE } from '@hychunk/core';
import { loadRegionTiles, saveRegionTiles } from './cache';

const SLOTS = REGION_SIZE * REGION_SIZE;
const PX = 32 * 32 * 4;
/** Regions held in memory at once: 4 MB each when full (8 * 4MB = 32 MB max). */
const MAX_REGIONS = 8;
const FLUSH_AFTER_MS = 4000;

// Chunk states in the cache; 0 is a chunk not read yet. DECOR is a predicted chunk that already has its trees, rocks and plants.
const HAVE = 1,
    DAMAGED = 2,
    DECOR = 3;
const floorDiv = (a: number, n: number) => Math.floor(a / n);

interface Held {
    state: Uint8Array;
    pixels: Uint8ClampedArray;
    dirty: boolean;
}

export interface CachedTile {
    pixels: Uint8ClampedArray | null;
    corrupt: boolean;
    /** Predicted, and with its trees, rocks and plants. */
    decor?: boolean;
}

/**
 * Rendered chunks kept per region, in memory and in the browser's storage, so going back to
 * somewhere already seen costs a copy instead of a decode — in this session and the next.
 * `key` identifies the exact files and colours they came from; `null` keeps it in memory only.
 */
export class TileCache {
    private regions = new Map<string, Promise<Held>>();
    private timers = new Map<string, number>();
    hits = 0;
    misses = 0;

    constructor(private readonly key: string | null) {}

    private region(rx: number, rz: number): Promise<Held> {
        const k = `${rx}.${rz}`;
        let p = this.regions.get(k);
        if (p) {
            // Most recently used goes last, so the front is what to drop.
            this.regions.delete(k);
            this.regions.set(k, p);
            return p;
        }
        p = (async () => {
            const held: Held = {
                state: new Uint8Array(SLOTS),
                pixels: new Uint8ClampedArray(SLOTS * PX),
                dirty: false
            };
            const saved = this.key ? await loadRegionTiles(this.key, rx, rz) : null;
            if (saved && saved.state.length === SLOTS) {
                const packed = new Uint8ClampedArray(saved.pixels);
                let at = 0;
                for (let i = 0; i < SLOTS; i++) {
                    held.state[i] = saved.state[i]!;
                    if (saved.state[i] === HAVE || saved.state[i] === DECOR)
                        (held.pixels.set(packed.subarray(at, at + PX), i * PX), (at += PX));
                }
            }
            return held;
        })();
        this.regions.set(k, p);
        this.trim();
        return p;
    }

    private trim() {
        while (this.regions.size > MAX_REGIONS) {
            const oldest = this.regions.keys().next().value!;
            const [rx, rz] = oldest.split('.').map(Number) as [number, number];
            void this.flush(rx, rz);
            this.regions.delete(oldest);
        }
    }

    /** The chunk if it has been rendered before; `null` when it has to be read. */
    async get(cx: number, cz: number): Promise<CachedTile | null> {
        const rx = floorDiv(cx, REGION_SIZE),
            rz = floorDiv(cz, REGION_SIZE);
        const held = await this.region(rx, rz);
        const slot = cx - rx * REGION_SIZE + (cz - rz * REGION_SIZE) * REGION_SIZE;
        const s = held.state[slot];
        if (s === DAMAGED) {
            this.hits++;
            return { pixels: null, corrupt: true };
        }
        if (s !== HAVE && s !== DECOR) {
            this.misses++;
            return null;
        }
        this.hits++;
        return { pixels: held.pixels.subarray(slot * PX, (slot + 1) * PX), corrupt: false, decor: s === DECOR };
    }

    /** Remembers a chunk that was just read. A chunk that is simply not in the save is not stored: the region header already says so. */
    async put(cx: number, cz: number, pixels: Uint8ClampedArray | null, corrupt: boolean, decor = false) {
        if (!pixels && !corrupt) return;
        const rx = floorDiv(cx, REGION_SIZE),
            rz = floorDiv(cz, REGION_SIZE);
        const held = await this.region(rx, rz);
        const slot = cx - rx * REGION_SIZE + (cz - rz * REGION_SIZE) * REGION_SIZE;
        if (pixels) {
            held.pixels.set(pixels, slot * PX);
            held.state[slot] = decor ? DECOR : HAVE;
        } else {
            held.state[slot] = DAMAGED;
        }
        held.dirty = true;
        if (this.key && !this.timers.has(`${rx}.${rz}`)) {
            this.timers.set(
                `${rx}.${rz}`,
                window.setTimeout(() => void this.flush(rx, rz), FLUSH_AFTER_MS)
            );
        }
    }

    /** Writes a region's rendered chunks to storage, packed so a sparse region stays small. */
    async flush(rx: number, rz: number) {
        const k = `${rx}.${rz}`;
        window.clearTimeout(this.timers.get(k));
        this.timers.delete(k);
        const p = this.regions.get(k);
        if (!p || !this.key) return;
        const held = await p;
        if (!held.dirty) return;
        held.dirty = false;
        let n = 0;
        for (let i = 0; i < SLOTS; i++) if (held.state[i] === HAVE || held.state[i] === DECOR) n++;
        const packed = new Uint8ClampedArray(n * PX);
        let at = 0;
        for (let i = 0; i < SLOTS; i++)
            if (held.state[i] === HAVE || held.state[i] === DECOR)
                (packed.set(held.pixels.subarray(i * PX, (i + 1) * PX), at), (at += PX));
        await saveRegionTiles(this.key, rx, rz, held.state.slice(), packed.buffer);
    }

    async flushAll() {
        await Promise.all(
            [...this.regions.keys()].map((k) => {
                const [rx, rz] = k.split('.').map(Number) as [number, number];
                return this.flush(rx, rz);
            })
        );
    }
}
