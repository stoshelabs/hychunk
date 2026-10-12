import { FastRandom } from '../noise/fastrandom';
import { hash2 } from '../noise/hash';
import { compileField, randomizer, WORLD_ROOT, type Field, type JsonNode, type Loader } from '../noise/graph';

// The climate mask: where land, shore, ocean and each climate zone lie. Written from the game's
// `ClimateMaskProvider`, `ClimateGraph`, `ClimateNoise` and the unique-zone search.

interface ClimateColor { land: number; shore: number; ocean: number; shallowOcean: number }
interface ClimatePoint { temperature: number; intensity: number; modifier: number }
export interface ClimateType { name: string; color: ClimateColor; island: ClimateColor; points: ClimatePoint[]; children: ClimateType[] }

const RESOLUTION = 512;
const SIZE = RESOLUTION * (1 - 2.220446049250313e-16);

/** `MathUtil.floor`: rounds toward negative infinity, saturating like a Java int. */
export function floorInt(d: number): number {
    if (d >= 2147483647) return 2147483647;
    if (d <= -2147483648) return -2147483648;
    return Math.floor(d);
}

const hex = (s: string | number) => typeof s === 'number' ? s & 0xffffff : parseInt(String(s).replace('#', '').replace('0x', ''), 16) & 0xffffff;

// ---- the graph: a 512 x 512 table of climate ids by (temperature, intensity), and its fade ----

export interface ClimateGraph {
    parents: ClimateType[];
    types: ClimateType[];
    table: Int32Array;
    fade: Float64Array;
    fadeDistance: number;
    typeAt(id: number): ClimateType;
}

export function loadClimateGraph(json: JsonNode, load: Loader): ClimateGraph {
    const res = (n: JsonNode): JsonNode => (n?.File ? load(n.File) : n);
    const color = (n: JsonNode, parent: ClimateColor | undefined): ClimateColor => {
        const get = (key: string, def: number) => (n[key] !== undefined ? hex(n[key]) : def);
        return {
            land: get('Color', -1),
            shore: get('Shore', parent?.shore ?? -1),
            ocean: get('Ocean', parent?.ocean ?? -1),
            shallowOcean: get('ShallowOcean', parent?.shallowOcean ?? -1)
        };
    };
    const type = (node: JsonNode, parent: ClimateType | undefined): ClimateType => {
        const n = res(node);
        const c = color(n, parent?.color);
        const island = n.Island !== undefined ? color(res(n.Island), parent?.island) : c;
        const t: ClimateType = {
            name: n.Name,
            color: c,
            island,
            points: ((n.Points ?? []) as JsonNode[]).map((p) => ({ temperature: p.Temperature ?? 0.5, intensity: p.Intensity ?? 0.5, modifier: p.Modifier ?? 1 })),
            children: []
        };
        t.children = ((n.Children ?? []) as JsonNode[]).map((ch) => type(ch, t));
        return t;
    };
    const parents = ((json.Climates ?? []) as JsonNode[]).map((n) => type(n, undefined));
    const fadeRadius: number = json.FadeRadius ?? 50;
    const fadeDistance: number = json.FadeDistance ?? 100;
    const fadeMode: string = json.FadeMode ?? 'CHILDREN';

    // Ids: each parent, then its descendants, depth first (at most ten levels).
    const types: ClimateType[] = [];
    const ids = new Map<ClimateType, number>();
    const walk = (t: ClimateType, depth: number) => {
        if (depth >= 10) return;
        ids.set(t, types.length);
        types.push(t);
        for (const ch of t.children) walk(ch, depth + 1);
    };
    for (const p of parents) walk(p, 0);

    const table = new Int32Array(RESOLUTION * RESOLUTION).fill(-1);
    const fade = new Float64Array(RESOLUTION * RESOLUTION);
    const populate = (recursive: boolean) => {
        for (let x = 0; x < RESOLUTION; x++) {
            for (let y = 0; y < RESOLUTION; y++) {
                let selected: ClimateType | undefined;
                let climates = parents;
                while (climates.length > 0) {
                    let nearest: ClimateType | undefined;
                    let min = Number.MAX_VALUE;
                    for (const c of climates) {
                        for (const p of c.points) {
                            const dx = x - p.temperature * SIZE, dy = y - p.intensity * SIZE;
                            const d2 = (dx * dx + dy * dy) / p.modifier;
                            if (d2 < min) { min = d2; nearest = c; }
                        }
                    }
                    if (!nearest) break;
                    selected = nearest;
                    climates = nearest.children;
                    if (!recursive) break;
                }
                table[y * RESOLUTION + x] = selected ? (ids.get(selected) ?? -1) : -1;
            }
        }
    };
    if (fadeMode === 'PARENTS') {
        populate(false);
        distanceTransform(table, fade, RESOLUTION, RESOLUTION, fadeRadius);
    }
    populate(true);
    if (fadeMode === 'CHILDREN') distanceTransform(table, fade, RESOLUTION, RESOLUTION, fadeRadius);

    return { parents, types, table, fade, fadeDistance, typeAt: (id) => types[id]! };
}

/** For each pixel, how far it is from the edge of its region, in pixels, capped at `radius` and divided by it. */
function distanceTransform(source: Int32Array, dest: Float64Array, width: number, height: number, radius: number) {
    const DX = [-1, 1, 0, 0, -1, -1, 1, 1], DY = [0, 0, -1, 1, -1, 1, -1, 1];
    const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
    const regions = new Map<number, number[]>();
    const boundaries = new Map<number, number[]>();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x, value = source[index]!;
            let r = regions.get(value);
            if (!r) regions.set(value, (r = []));
            r.push(index);
            for (let i = 0; i < 4; i++) {
                const nx = x + DX[i]!, ny = y + DY[i]!;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height || source[ny * width + nx] === value) continue;
                let b = boundaries.get(value);
                if (!b) boundaries.set(value, (b = []));
                b.push(index);
                break;
            }
        }
    }
    const dist = new Float64Array(width * height);
    for (const [id, region] of regions) {
        const boundary = boundaries.get(id) ?? [];
        if (boundary.length === 0) {
            for (const i of region) dest[i] = 1;
            continue;
        }
        dist.fill(radius);
        const heap = new MinHeap();
        for (const i of boundary) { dist[i] = 0; heap.push(0, i); }
        while (heap.size) {
            const [d, index] = heap.pop();
            if (d > dist[index]!) continue;
            const cx = index % width, cy = (index / width) | 0;
            for (let k = 0; k < 8; k++) {
                const nx = cx + DX[k]!, ny = cy + DY[k]!;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const ni = ny * width + nx;
                if (source[ni] !== id) continue;
                const nd = d + COST[k]!;
                if (nd < dist[ni]!) { dist[ni] = nd; heap.push(nd, ni); }
            }
        }
        for (const i of region) dest[i] = Math.min(radius, Math.max(0, dist[i]!)) / radius;
    }
}

class MinHeap {
    private d: number[] = [];
    private v: number[] = [];
    get size() { return this.d.length; }
    push(d: number, v: number) {
        let i = this.d.length;
        this.d.push(d); this.v.push(v);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.d[p]! <= d) break;
            this.d[i] = this.d[p]!; this.v[i] = this.v[p]!;
            i = p;
        }
        this.d[i] = d; this.v[i] = v;
    }
    pop(): [number, number] {
        const top: [number, number] = [this.d[0]!, this.v[0]!];
        const d = this.d.pop()!, v = this.v.pop()!;
        const n = this.d.length;
        if (n > 0) {
            let i = 0;
            for (;;) {
                let c = 2 * i + 1;
                if (c >= n) break;
                if (c + 1 < n && this.d[c + 1]! < this.d[c]!) c++;
                if (this.d[c]! >= d) break;
                this.d[i] = this.d[c]!; this.v[i] = this.v[c]!;
                i = c;
            }
            this.d[i] = d; this.v[i] = v;
        }
        return top;
    }
}

// ---- noise, thresholds and colours ----

export interface ClimateNoise {
    continent: Field;
    temperature: Field;
    intensity: Field;
    land: number;
    island: number;
    landShoreInner: number;
    islandShoreInner: number;
    landShallowOceanOuter: number;
    islandShallowOceanOuter: number;
}

export function loadClimateNoise(json: JsonNode, load: Loader): ClimateNoise {
    const t = json.Thresholds ?? {};
    const land: number = t.Land ?? 0.5, island: number = t.Island ?? 0.8, beach: number = t.BeachSize ?? 0.05, shore: number = t.ShallowOceanSize ?? 0.15;
    if (json.Grid !== undefined) throw new Error('A climate Grid is not supported yet');
    const scope = { root: WORLD_ROOT, path: WORLD_ROOT };
    return {
        continent: compileField(json.Continent, load, scope),
        temperature: compileField(json.Temperature, load, scope),
        intensity: compileField(json.Intensity, load, scope),
        land, island,
        landShoreInner: land - beach,
        islandShoreInner: island + beach,
        landShallowOceanOuter: land + shore,
        islandShallowOceanOuter: island - shore * 0.5
    };
}

const IS_OCEAN = 0x80000000, IS_SHORE = 0x40000000, IS_ISLAND = 0x20000000;

function continentFlags(c: number, n: ClimateNoise): number {
    const isLand = c <= n.landShallowOceanOuter;
    const isIsland = c >= n.islandShallowOceanOuter;
    const isOcean = c > n.land && c < n.island;
    const isShore = (isLand && c > n.landShoreInner) || (isIsland && c < n.islandShoreInner);
    return ((isOcean ? IS_OCEAN : 0) | (isShore ? IS_SHORE : 0) | (isIsland ? IS_ISLAND : 0)) >>> 0;
}

/** The mask colour of a climate id with its continent flags (`ClimateType.color`). */
function colorOf(id: number, graph: ClimateGraph): number {
    const flags = (id & 0xe0000000) >>> 0;
    const type = graph.typeAt(id & 0x1fffffff);
    const island = type?.island ?? type?.color;
    if (!type || !island) return 0;
    switch (flags) {
        case 0x80000000: return type.color.ocean;
        case 0x40000000: return type.color.shore;
        case 0xc0000000: return type.color.shallowOcean;
        case 0x20000000: return island.land;
        case 0x60000000: return island.shore;
        case 0xe0000000: return island.shallowOcean;
        default: return type.color.land;
    }
}

// ---- the unique zones: where the spawn and the temple are put ----

interface Range { value: number; radius: number; weight: number }
interface Rule { continent: Range; temperature: Range; intensity: Range; fade: Range; sumWeight: number }
interface UniqueEntry { zone: string; parent: string; color: number; radius: number; originX: number; originY: number; minDistance: number; maxDistance: number; rule: Rule }
export interface UniquePlace { zone: string; color: number; radius: number; x: number; y: number }

const rangeOf = (n: JsonNode | undefined): Range => (n ? { value: n.Target, radius: n.Radius, weight: n.Weight } : { value: 0, radius: 1, weight: 0 });
const inRange = (r: Range, v: number) => Math.abs(v - r.value) <= r.radius;
const scoreOf = (r: Range, v: number) => 1 - Math.min(r.radius, Math.abs(v - r.value)) / r.radius;

function loadEntries(json: JsonNode[]): UniqueEntry[] {
    return json.map((e) => {
        const rule = e.Rule ?? {};
        const r = { continent: rangeOf(rule.Continent), temperature: rangeOf(rule.Temperature), intensity: rangeOf(rule.Intensity), fade: rangeOf(rule.Fade) };
        return {
            zone: e.Name, parent: e.Parent ?? '', color: hex(e.Color), radius: e.Radius ?? 8,
            originX: e.OriginX ?? 8, originY: e.OriginY ?? 8,
            minDistance: e.MinDistance ?? 100, maxDistance: e.Distance ?? 5000,
            rule: { ...r, sumWeight: r.continent.weight + r.temperature.weight + r.intensity.weight + r.fade.weight }
        };
    });
}

/** Ring by ring around (cx, cy), the best place for the rule (`ClimateSearch.search`). */
function search(seed: number, cx: number, cy: number, startRadius: number, searchRadius: number, rule: Rule, noise: ClimateNoise, graph: ClimateGraph) {
    let best = 0;
    let bx = cx, by = cy;
    const radius = Math.min(searchRadius, 10000);
    const rng = new FastRandom(hash2(seed, 1659788403585));
    for (let r = startRadius; r <= radius; r += 100) {
        const steps = Math.floor((Math.PI * 2 * r) / 100);
        const inc = (Math.PI * 2) / steps;
        const off = Math.PI * 2 * rng.nextDouble();
        for (let i = 0; i < steps; i++) {
            const t = i * inc + off;
            const x = cx + Math.trunc(Math.cos(t) * r), y = cy + Math.trunc(Math.sin(t) * r);
            const score = collect(seed, x, y, noise, graph, rule);
            if (score > best) { bx = x; by = y; best = score; }
        }
        if (best >= 0.75) break;
    }
    return { x: bx, y: by, score: best };
}

function collect(seed: number, x: number, y: number, noise: ClimateNoise, graph: ClimateGraph, rule: Rule): number {
    const c = noise.continent(seed, x, y);
    if (!inRange(rule.continent, c)) return 0;
    const t = noise.temperature(seed, x, y);
    if (!inRange(rule.temperature, t)) return 0;
    const i = noise.intensity(seed, x, y);
    if (!inRange(rule.intensity, i)) return 0;
    const f = graph.fade[floorInt(t * SIZE) + floorInt(i * SIZE) * RESOLUTION]!;
    if (!inRange(rule.fade, f)) return 0;
    const sum = scoreOf(rule.continent, c) * rule.continent.weight + scoreOf(rule.temperature, t) * rule.temperature.weight
        + scoreOf(rule.intensity, i) * rule.intensity.weight + scoreOf(rule.fade, f) * rule.fade.weight;
    return sum / rule.sumWeight;
}

function placeUniques(seed: number, entries: UniqueEntry[], noise: ClimateNoise, graph: ClimateGraph): UniquePlace[] {
    const placed = new Map<string, UniquePlace>();
    const out: (UniquePlace | undefined)[] = new Array(entries.length).fill(undefined);
    for (let it = 0; it < 10 && placed.size < entries.length; it++) {
        entries.forEach((e, i) => {
            if (out[i]) return;
            const parent = placed.get(e.parent);
            if (e.parent !== '' && !parent) return;
            const ox = parent ? parent.x : 0, oy = parent ? parent.y : 0;
            const found = search(seed, ox + e.originX, oy + e.originY, e.minDistance, e.maxDistance, e.rule, noise, graph);
            const place = { zone: e.zone, color: e.color, radius: e.radius, x: found.x, y: found.y };
            out[i] = place;
            placed.set(e.zone, place);
        });
    }
    return out.filter((p): p is UniquePlace => !!p);
}

// ---- the mask ----

export interface ClimateMask {
    uniques: UniquePlace[];
    /** The point looked up for (x, z): the coordinates are warped a little first. */
    warp(seed: number, x: number, z: number): [number, number];
    /** Mask colour and how far from the edge of its region (in blocks) at a warped point. */
    at(seed: number, rx: number, rz: number): { color: number; fade: number };
}

export interface ClimateMaskDefinition {
    noise: ClimateNoise;
    graph: ClimateGraph;
    entries: UniqueEntry[];
    warp: (seed: number, x: number, z: number) => [number, number];
}

/** Reads `Mask.json`; the per-seed part (where the unique zones go) is done by `forSeed`. */
export function loadClimateMask(mask: JsonNode, load: Loader): { forSeed(seed: number): ClimateMask } {
    const noise = loadClimateNoise(mask.Noise, load);
    const graph = loadClimateGraph(mask.Climate, load);
    const entries = loadEntries((mask.UniqueZones ?? []) as JsonNode[]);
    const r = randomizer(mask.Randomizer, load, { root: WORLD_ROOT, path: WORLD_ROOT });
    const warp = (seed: number, x: number, z: number): [number, number] => [x + r.x(seed, x, z), z + r.y(seed, x, z)];
    return {
        forSeed(seed) {
            const uniques = placeUniques(seed, entries, noise, graph);
            return {
                uniques,
                warp: (s, x, z) => warp(s, x, z),
                at(s, rx, rz) {
                    const fx = floorInt(rx), fz = floorInt(rz);
                    for (const u of uniques) {
                        const dx = fx - u.x, dy = fz - u.y;
                        if (dx >= -u.radius && dy >= -u.radius && dx <= u.radius && dy <= u.radius && dx * dx + dy * dy <= u.radius * u.radius) return { color: u.color, fade: NaN };
                    }
                    const c = noise.continent(s, rx, rz), t = noise.temperature(s, rx, rz), i = noise.intensity(s, rx, rz);
                    const index = floorInt(t * SIZE) + floorInt(i * SIZE) * RESOLUTION;
                    const id = (graph.table[index]! | continentFlags(c, noise)) | 0;
                    return { color: colorOf(id, graph), fade: graph.fade[index]! * graph.fadeDistance };
                }
            };
        }
    };
}
