import { compileField, WORLD_ROOT, type Field, type JsonNode, type Loader } from '../noise/graph';

// The block layers of a biome (`LayerContainer`, `LayerPopulator`): what the top of a column is made of.
// Static layers fill fixed heights, dynamic layers hang from the ground surface; later ones overwrite earlier ones.

type At = (seed: number, x: number, z: number) => number;
type Interval = [number, number];

function intervals(d: unknown): Interval[] {
    if (d === undefined || d === null) return [[-Infinity, Infinity]];
    if (typeof d === 'number') return [[0, d]];
    const a = d as unknown[];
    return Array.isArray(a[0]) ? (a as Interval[]) : [a as Interval];
}

/** `NoiseMaskConditionJsonLoader`: no mask is always true. */
export function maskOf(json: JsonNode | undefined, load: Loader, path: string): ((seed: number, x: number, z: number) => boolean) | null {
    if (!json) return null;
    if (json.File) return maskOf(load(json.File), load, path);
    if (json.Threshold === undefined) throw new Error('Could not find threshold data in noise mask. Keyword: Threshold');
    const noise = compileField(json, load, { root: WORLD_ROOT, path: `${path}.NoiseMaskCondition` });
    const test = intervals(json.Threshold);
    return (s, x, z) => { const v = noise(s, x, z); return test.some(([lo, hi]) => lo <= v && v <= hi); };
}

/** `DoubleRangeJsonLoader` + `DoubleRangeNoiseSupplier`: a constant, `[min, max]` moved along by a noise, or thresholds mapped to values. */
function rangeOf(json: any, fallback: number, noise: Field | null): At {
    const n: At = noise ?? (() => 0);
    if (json === undefined || json === null) return () => fallback;
    if (typeof json === 'number') return () => json;
    if (Array.isArray(json)) {
        if (json.length === 1) return () => json[0];
        if (json.length !== 2) throw new Error(`Range array contains ${json.length} values. Only 1 or 2 entries are allowed.`);
        const lo = json[0], span = json[1] - json[0];
        return (s, x, z) => lo + span * n(s, x, z);
    }
    if (json.Thresholds && json.Values) {
        const t: number[] = json.Thresholds, v: number[] = json.Values;
        return (s, x, z) => {
            const w = n(s, x, z);
            if (w > t[t.length - 1]!) return v[v.length - 1]!;
            let min = 0;
            for (let i = 0; i < t.length; i++) {
                if (w < t[i]!) return i === 0 ? v[0]! : v[i - 1]! + ((w - min) / (t[i]! - min)) * (v[i]! - v[i - 1]!);
                min = t[i]!;
            }
            return 0;
        };
    }
    if (json.Min === undefined || json.Max === undefined) throw new Error('Range object needs Min and Max');
    const lo = json.Min, span = json.Max - json.Min;
    return (s, x, z) => lo + span * n(s, x, z);
}

export interface LayerBlock { block: string | null; fluid: string | null; reps: At }

/** `BlockPattern` names carry a rotation after `|`; the map does not care for it. */
function parseBlock(name: string): { block: string | null; fluid: string | null } {
    return name.startsWith('fluid#') ? { block: null, fluid: name.slice(6) } : { block: name.split('|')[0]!, fluid: null };
}

function loadBlocks(json: any, load: Loader, path: string): LayerBlock[] {
    if (json === undefined || json === null) return [];
    if (json.File) return loadBlocks(load(json.File), load, path);
    const base = `${path}.NoiseBlockArray`;
    const entry = (e: any, at: string): LayerBlock => {
        if (e && e.File) return entry(load(e.File), at);
        const here = `${at}.Entry`;
        if (typeof e === 'string') {
            const [name, n] = e.includes(':') ? e.split(':') : [e, '1'];
            return { ...parseBlock(name!), reps: () => Number(n) };
        }
        if (e && typeof e === 'object') {
            const noise = e.RepeatNoise ? compileField(e.RepeatNoise, load, { root: WORLD_ROOT, path: here }) : null;
            return { ...parseBlock(e.Type), reps: rangeOf(e.Repeat, 1, noise) };
        }
        throw new Error(`Unsupported Json Entry: ${JSON.stringify(e)}`);
    };
    if (typeof json === 'string') return [entry(json, base)];
    if (!Array.isArray(json) && !json.Entries) return [entry(json, `${base}-0`)];
    const list: any[] = Array.isArray(json) ? json : json.Entries;
    return list.map((e, i) => entry(e, `${base}-${i}`));
}

interface Entry { blocks: LayerBlock[]; mask: ReturnType<typeof maskOf> }
interface StaticEntry extends Entry { min: At; max: At }
interface StaticLayer { entries: StaticEntry[]; mask: ReturnType<typeof maskOf> }
interface DynamicLayer { entries: Entry[]; mask: ReturnType<typeof maskOf>; offset: At }

export interface Layers {
    filling: string;
    statics: StaticLayer[];
    dynamics: DynamicLayer[];
}

export function loadLayers(json: JsonNode, load: Loader, biomePath: string): Layers {
    if (json.Default === undefined) throw new Error('Could not find default material. Keyword: Default');
    const base = `${biomePath}.LayerContainer`;
    const expand = (n: any): any => (n && n.File ? expand(load(n.File)) : n);
    const entriesOf = (layer: any): any[] => (layer.Entries ? layer.Entries.map(expand) : [layer]);

    const statics = ((json.Static ?? []) as any[]).map((raw, i) => {
        const layer = expand(raw);
        const at = `${base}-${i}.StaticLayer`;
        const listed = !!layer.Entries;
        const entries = entriesOf(layer).map((e, j) => {
            const p = `${listed ? `${at}-${j}` : at}.StaticLayerEntry.LayerEntry`;
            const field = (key: string) => (e[key] ? compileField(e[key], load, { root: WORLD_ROOT, path: p }) : null);
            if (e.Min === undefined) throw new Error('Could not find minimum of static layer entry.');
            if (e.Max === undefined) throw new Error('Could not find maximum of static layer entry.');
            return { blocks: loadBlocks(e.Blocks, load, p), mask: maskOf(e.NoiseMask, load, p), min: rangeOf(e.Min, 0, field('MinNoise')), max: rangeOf(e.Max, 0, field('MaxNoise')) };
        });
        return { entries, mask: maskOf(layer.NoiseMask, load, at) };
    });

    const dynamics = ((json.Dynamic ?? []) as any[]).map((raw, i) => {
        const layer = expand(raw);
        const at = `${base}-${i}.DynamicLayer`;
        const listed = !!layer.Entries;
        const entries = entriesOf(layer).map((e, j) => {
            const p = `${listed ? `${at}-${j}` : at}.LayerEntry`;
            return { blocks: loadBlocks(e.Blocks, load, p), mask: maskOf(e.NoiseMask, load, p) };
        });
        const offsetNoise = layer.Offset !== undefined && layer.OffsetNoise ? compileField(layer.OffsetNoise, load, { root: WORLD_ROOT, path: at }) : null;
        return { entries, mask: maskOf(layer.NoiseMask, load, at), offset: layer.Offset !== undefined ? rangeOf(layer.Offset, 0, offsetNoise) : () => 0 };
    });

    return { filling: String(json.Default).split('|')[0]!, statics, dynamics };
}

export interface Top { block: string; /** The surface after the dynamic layers lifted it. */ y: number; fluid: { name: string; y: number } | null }

/** What `LayerPopulator` leaves on top of a column whose ground reaches `surface`: the topmost block, and a fluid a layer put there. */
export function topOfColumn(layers: Layers, seed: number, x: number, z: number, surface: number): Top {
    // Static layers: the last one that covers `surface` wins. A layer's blocks run down from `max`, the last block fills to `min`.
    let block = layers.filling;
    for (const layer of layers.statics) {
        if (layer.mask && !layer.mask(seed, x, z)) continue;
        const e = layer.entries.find((c) => !c.mask || c.mask(seed, x, z));
        if (!e) continue;
        const min = Math.max(Math.floor(e.min(seed, x, z)), 0);
        let y = Math.floor(e.max(seed, x, z));
        let last: string | null = null, hit: string | null = null, done = false;
        for (const b of e.blocks) {
            const reps = Math.floor(b.reps(seed, x, z));
            if (reps <= 0) continue;
            if (b.block) last = b.block;
            for (let i = 0; i < reps && !done; i++) {
                y--;
                if (y === surface && b.block) hit = b.block;
                if (y <= min) done = true;
            }
            if (done) break;
        }
        if (!done && last && surface >= min && surface < y) hit = last;
        if (hit) block = hit;
    }

    // Dynamic layers: written downwards from the surface, each one starting where the previous one ended plus its own offset.
    let y = surface, maxY = surface;
    const written = new Map<number, { block: string | null; fluid: string | null }>();
    outer: for (const layer of layers.dynamics) {
        if (layer.mask && !layer.mask(seed, x, z)) continue;
        const e = layer.entries.find((c) => !c.mask || c.mask(seed, x, z));
        if (!e) continue;
        y += Math.floor(layer.offset(seed, x, z));
        maxY = Math.max(maxY, y);
        for (const b of e.blocks) {
            const reps = Math.floor(b.reps(seed, x, z));
            for (let i = 0; i < reps; i++) {
                if (y < 0) break outer;
                written.set(y, { block: b.block, fluid: b.fluid });
                y--;
            }
        }
    }
    let fluid: Top['fluid'] = null;
    const top = written.get(maxY);
    if (top) {
        if (top.fluid) fluid = { name: top.fluid, y: maxY };
        if (top.block) block = top.block;
        else if (top.fluid) {
            // a fluid layer: the block under it is the next one written
            for (let k = maxY - 1; k >= surface; k--) { const w = written.get(k); if (w?.block) { block = w.block; break; } }
        }
    }
    return { block, y: maxY, fluid };
}

/** `LayerContainer.getTopBlockAt`: the first block of the first dynamic layer that applies, else the filling. */
export function dynamicTopBlock(layers: Layers, seed: number, x: number, z: number): string {
    for (const layer of layers.dynamics) {
        if (layer.mask && !layer.mask(seed, x, z)) continue;
        const e = layer.entries.find((c) => !c.mask || c.mask(seed, x, z));
        if (!e) continue;
        for (const b of e.blocks) {
            if (Math.floor(b.reps(seed, x, z)) > 0) return b.block ?? '';
        }
        return '';
    }
    return layers.filling;
}
