import { CELL_2D } from './celltable';
import { fastFloor, toInt } from './general';
import { random2, random3, rehash3Int } from './hash';

// Ported from the game's cell noise (`CellNoise`, `DistanceNoise`) on square and hexagonal grids,
// with distances to the point or to the border between cells.

export type DistanceMode = 'EUCLIDEAN' | 'MANHATTAN' | 'NATURAL' | 'MAX';
export type CellMode = 'CELL_VALUE' | 'NOISE_LOOKUP' | 'DISTANCE';
export type Distance2Mode = 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MIN' | 'MAX';

export interface CellOptions {
    distanceMode?: DistanceMode;
    jitterX: number;
    jitterY: number;
    /** Cells whose random value falls outside every `[min, max]` have no point. */
    density?: [number, number][];
    /** Each point's distance is multiplied by a value in this range, picked by the cell's hash. */
    distanceRange?: [number, number];
    skip?: number;
    skipMode?: 'CHECKERBOARD' | 'GRID';
    /** Scales each point's distance by a value that depends on its cell (biome size modifiers). */
    sizeMod?: (seed: number, cx: number, cy: number) => number;
    /** Hexagonal cells instead of squares. */
    hex?: boolean;
    /** Distance to the border with the neighbouring cell, not to the point. */
    border?: boolean;
}

const DISTANCE: Record<DistanceMode, (dx: number, dy: number) => number> = {
    EUCLIDEAN: (dx, dy) => dx * dx + dy * dy,
    MANHATTAN: (dx, dy) => Math.abs(dx) + Math.abs(dy),
    NATURAL: (dx, dy) => Math.abs(dx) + Math.abs(dy) + dx * dx + dy * dy,
    MAX: (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
};

const DISTANCE2: Record<Distance2Mode, (d: number, d2: number) => number> = {
    ADD: (d, d2) => d + d2,
    SUB: (d, d2) => d2 - d,
    MUL: (d, d2) => d * d2,
    DIV: (d, d2) => d / d2,
    MIN: (d) => d,
    MAX: (_d, d2) => d2
};

const limit = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const SQRT3 = Math.sqrt(3);
const HEX_SCALE = (SQRT3 + 1.5) / 2;
const HEX_TABLE = CELL_2D.map((v) => v - 0.5);
const jitterMax = (o: CellOptions) => [o.jitterX, o.jitterY] as const;

/** The scale applied to coordinates before looking for cells. */
export const scaleOf = (opts: CellOptions) => (opts.hex ? HEX_SCALE : 1);

/** `HexCellDistanceFunction.SquirrelHash`. */
function squirrel(seed: number, x: number, y: number): number {
    let h = (x + Math.imul(y, 198491317)) | 0;
    h = Math.imul(h, -1255572915);
    h = (h + seed) | 0;
    h ^= h >> 8;
    h = (h - 1255572915) | 0;
    h ^= h << 8;
    h = Math.imul(h, -1255572915);
    h ^= h >> 8;
    return h | 0;
}

/** Java's `(int) MathUtil.fastRound(d)`. */
const fastRound = (d: number) => toInt(Math.floor(d + 0.5));

export interface Found {
    hash: number;
    ix: number;
    iy: number;
    distance: number;
    x: number;
    y: number;
    hash2: number;
    distance2: number;
}

export const blank = (): Found => ({ hash: 0, ix: 0, iy: 0, distance: 0, x: 0, y: 0, hash2: 0, distance2: 0 });

interface Cell { hash: number; x: number; y: number }
const cell: Cell = { hash: 0, x: 0, y: 0 };

/** Where cell (cx, cy) has its point: the hash that stands for the cell, and the point (hexagonal cells are sheared). */
function pointOf(opts: CellOptions, seed: number, cx: number, cy: number): Cell {
    if (opts.hex) {
        const hash = squirrel(seed, cx, cy);
        const i = (hash & 0xff) * 2;
        const px = cx + HEX_TABLE[i]! * opts.jitterX, py = cy + HEX_TABLE[i + 1]! * opts.jitterY;
        cell.hash = hash;
        cell.x = SQRT3 * px + (SQRT3 / 2) * py;
        cell.y = 1.5 * py;
    } else {
        const hash = rehash3Int(seed, cx, cy);
        const i = (hash & 0xff) * 2;
        cell.hash = hash;
        cell.x = cx + CELL_2D[i]! * opts.jitterX;
        cell.y = cy + CELL_2D[i + 1]! * opts.jitterY;
    }
    return cell;
}

/** Which cell the (already scaled) coordinates fall in. */
function cellOf(opts: CellOptions, x: number, y: number): [number, number] {
    if (opts.hex) return [fastRound((SQRT3 / 3) * x + (-1 / 3) * y), fastRound((2 / 3) * y)];
    return [fastFloor(x), fastFloor(y)];
}

/** Which cells have a point: the skip pattern, then the density test. */
function present(opts: CellOptions): (hash: number, cx: number, cy: number) => boolean {
    const density = opts.density;
    const skip = opts.skip ?? 0;
    let mask = 0, mid = 0;
    if (skip > 0) {
        let interval = 1; // HashCommon.nextPowerOfTwo(max(0, skip) + 1)
        while (interval < skip + 1) interval <<= 1;
        mask = interval - 1;
        mid = interval >> 1;
    }
    const checker = (opts.skipMode ?? 'CHECKERBOARD') === 'CHECKERBOARD';
    return (hash, cx, cy) => {
        if (skip > 0) {
            const x0 = cx & mask, y0 = cy & mask;
            const keep = (x0 === 0 && y0 === 0) || (checker && x0 === mid && y0 === mid);
            if (!keep) return false;
        }
        if (density) {
            const r = random2(hash, -1694747730);
            if (!density.some(([lo, hi]) => lo <= r && r <= hi)) return false;
        }
        return true;
    };
}

const keepCache = new WeakMap<CellOptions, (hash: number, cx: number, cy: number) => boolean>();
const offsetCache = new WeakMap<CellOptions, [Int8Array, Int8Array]>();

/** `present(opts)`, built once per set of options: a search runs for every column. */
function keepOf(opts: CellOptions) {
    let k = keepCache.get(opts);
    if (!k) keepCache.set(opts, (k = present(opts)));
    return k;
}

/** The offsets of `neighbours`, flat (dx, dy pairs), for one-cell and two-nearest searches. */
function offsetsOf(opts: CellOptions, two: boolean): Int8Array {
    let o = offsetCache.get(opts);
    if (!o) {
        const flat = (t: boolean) => Int8Array.from(neighbours(opts, 0, 0, t).flat());
        offsetCache.set(opts, (o = [flat(false), flat(true)]));
    }
    return o[two ? 1 : 0];
}

/** The cells looked at around (cellX, cellY): the nine next to it, and for hexagons more when the points are jittered far. */
function neighbours(opts: CellOptions, cellX: number, cellY: number, two: boolean): [number, number][] {
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push([cellX + dx, cellY + dy]);
    if (opts.hex && two) {
        const [jx, jy] = jitterMax(opts);
        if (jx > 0.5) out.push([cellX - 2, cellY - 1], [cellX - 2, cellY], [cellX - 2, cellY + 1], [cellX + 2, cellY], [cellX + 2, cellY - 1], [cellX + 2, cellY + 1]);
        if (jy > 0.5) out.push([cellX - 1, cellY - 2], [cellX, cellY - 2], [cellX + 1, cellY - 2], [cellX - 1, cellY + 2], [cellX, cellY + 2], [cellX + 1, cellY + 2]);
    }
    return out;
}

/** `MathUtil.distanceToInfLineSq`. */
function lineSq(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const dx0 = x - ax, dy0 = y - ay, dx1 = bx - ax, dy1 = by - ay;
    let t = dx0 * dx1 + dy0 * dy1;
    t /= dx1 * dx1 + dy1 * dy1;
    const px = ax + t * dx1, py = ay + t * dy1;
    const ex = x - px, ey = y - py;
    return ex * ex + ey * ey;
}

/**
 * Looks around (x, y), already scaled, for the nearest point (and the second nearest when `two`),
 * or for the nearest border between cells when `opts.border`.
 */
export function search(opts: CellOptions, seed: number, x: number, y: number, out: Found, two: boolean) {
    const dist = DISTANCE[opts.distanceMode ?? 'EUCLIDEAN'];
    const keep = keepOf(opts);
    const range = opts.distanceRange;
    out.distance = Infinity;
    out.distance2 = Infinity;
    const [cellX, cellY] = cellOf(opts, x, y);

    if (opts.border) {
        // The nearest point decides the cell; then the distance is to the line halfway to each neighbour's point.
        for (const [cx, cy] of neighbours({ ...opts, hex: opts.hex }, cellX, cellY, false).slice(0, 9)) {
            const c = pointOf(opts, seed, cx, cy);
            const d = DISTANCE.EUCLIDEAN(c.x - x, c.y - y);
            if (d < out.distance) { out.distance = d; out.hash = c.hash; out.ix = cx; out.iy = cy; out.x = c.x; out.y = c.y; }
        }
        if (opts.density && !present({ ...opts, skip: 0 })(out.hash, out.ix, out.iy)) { out.distance = 0; out.distance2 = Infinity; return; }
        const ox = out.ix, oy = out.iy, ax = out.x, ay = out.y;
        out.distance = Infinity;
        out.distance2 = Infinity;
        const dx = opts.jitterX > 0.5 ? 2 : 1, dy = opts.jitterY > 0.5 ? 2 : 1;
        for (let cy = oy - dy; cy <= oy + dy; cy++) {
            for (let cx = ox - dx; cx <= ox + dx; cx++) {
                const c = pointOf(opts, seed, cx, cy);
                if (cx === ox && cy === oy) continue;
                const mx = (c.x + ax) * 0.5, my = (c.y + ay) * 0.5;
                const d = lineSq(x, y, mx, my, mx + -(c.y - ay), my + (c.x - ax));
                if (d < out.distance) { out.distance2 = out.distance; out.distance = d; } else if (d < out.distance2) out.distance2 = d;
            }
        }
        return;
    }

    const offs = offsetsOf(opts, two);
    for (let n = 0; n < offs.length; n += 2) {
        const cx = cellX + offs[n]!, cy = cellY + offs[n + 1]!;
        const c = pointOf(opts, seed, cx, cy);
        if (!keep(c.hash, cx, cy)) continue;
        let d = dist(c.x - x, c.y - y);
        if (opts.sizeMod) d *= opts.sizeMod(seed, cx, cy);
        if (range !== undefined) d *= range[0] + (range[1] - range[0]) * random2(c.hash, 1495661265);
        if (d < out.distance) {
            if (two) { out.distance2 = out.distance; out.hash2 = out.hash; }
            out.distance = d; out.hash = c.hash; out.ix = cx; out.iy = cy; out.x = c.x; out.y = c.y;
        } else if (two && d < out.distance2) {
            out.distance2 = d; out.hash2 = c.hash;
        }
    }
    if (opts.hex) {
        out.distance *= 1 / 3;
        if (two) out.distance2 *= 1 / 3;
    }
}

/** `CellNoise`: one value per cell, or the distance to the nearest point, or a lookup at that point. */
export function cellNoise(opts: CellOptions, mode: CellMode, lookup?: (seed: number, x: number, y: number) => number) {
    const found = blank();
    const k = scaleOf(opts);
    return (seed: number, offsetSeed: number, x: number, y: number): number => {
        search(opts, offsetSeed, x * k, y * k, found, false);
        let v: number;
        switch (mode) {
            case 'CELL_VALUE': v = random3(offsetSeed, found.ix, found.iy); break;
            // Without a lookup noise the game falls back to the cell value.
            case 'NOISE_LOOKUP': v = lookup ? lookup(seed, found.x / k, found.y / k) : random3(offsetSeed, found.ix, found.iy); break;
            case 'DISTANCE': v = Math.sqrt(found.distance); break;
        }
        return limit(v) * 2 - 1;
    };
}

/** `DistanceNoise`: a function of the distances to the nearest and second nearest points (or borders). */
export function distanceNoise(opts: CellOptions, mode: Distance2Mode) {
    const found = blank();
    const f = DISTANCE2[mode];
    const k = scaleOf(opts);
    return (_seed: number, offsetSeed: number, x: number, y: number): number => {
        search(opts, offsetSeed, x * k, y * k, found, true);
        return limit(f(Math.sqrt(found.distance), Math.sqrt(found.distance2))) * 2 - 1;
    };
}

/**
 * `PointGenerator.collect`: the point of every cell that has one inside the (already scaled) box, handed over in the game's order
 * (rows first). Square cells only.
 */
export function collectPoints(opts: CellOptions, seed: number, minX: number, minY: number, maxX: number, maxY: number, out: (x: number, y: number) => void) {
    const keep = present(opts);
    if (opts.hex) {
        // `HexCellDistanceFunction.collect`: the box is scaled, the cells around it walked row by row (each row shifted half a cell
        // per step), and a point is kept when it lies inside the scaled box.
        const sx0 = minX * HEX_SCALE, sy0 = minY * HEX_SCALE, sx1 = maxX * HEX_SCALE, sy1 = maxY * HEX_SCALE;
        const [cx0, cy0] = cellOf(opts, sx0, sy0), [cx1, cy1] = cellOf(opts, sx1, sy1);
        const lowY = cy0 - 1, highY = cy1 + 1, lowX = cx0 - 1, highX = cx1 + 1;
        const height = highY - lowY;
        const width = highX - lowX + (height >> 1);
        for (let dy = 0; dy <= height; dy++) {
            const cy = lowY + dy, startX = lowX - (dy >> 1);
            for (let dx = 0; dx <= width; dx++) {
                const cx = startX + dx;
                const c = pointOf(opts, seed, cx, cy);
                if (c.x < sx0 || c.x > sx1 || c.y < sy0 || c.y > sy1) continue;
                if (!keep(c.hash, cx, cy)) continue;
                out(c.x / HEX_SCALE, c.y / HEX_SCALE);
            }
        }
        return;
    }
    const x0 = fastFloor(minX), y0 = fastFloor(minY), x1 = fastFloor(maxX), y1 = fastFloor(maxY);
    for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
            const c = pointOf(opts, seed, cx, cy);
            if (!keep(c.hash, cx, cy)) continue;
            out(c.x, c.y);
        }
    }
}
