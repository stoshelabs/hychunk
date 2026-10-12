import { compileField, WORLD_ROOT, type JsonNode, type Loader } from '../noise/graph';
import type { FastRandom } from '../noise/fastrandom';

// The covers of a biome (`CoverContainer`, `BlockPopulator.generateCovers`): grass, flowers, small stones and the like
// placed on the surface with a density, and sometimes in place of the top layers (a negative `Offset`).

export interface CoverPart { block: string | null; fluid: string | null; offset: number }

export interface Cover {
    parts: CoverPart[];
    weights: number[];
    total: number;
    mask: ((seed: number, x: number, z: number) => boolean) | null;
    /** `HeightCondition`: draws a random number only when the threshold is between 0 and 1. */
    height: ((seed: number, x: number, z: number, y: number, random: FastRandom) => boolean) | null;
    /** `block|fluid` keys of the allowed blocks underneath, or null for any. */
    parent: Set<string> | null;
    density: number;
    onWater: boolean;
}

export interface ThresholdLike {
    context(seed: number, x: number, z: number): number;
    at(seed: number, x: number, z: number, y: number, context: number): number;
}

type Intervals = [number, number][];
function intervals(d: unknown): Intervals {
    if (d === undefined || d === null) return [[-Infinity, Infinity]];
    if (typeof d === 'number') return [[0, d]];
    const a = d as unknown[];
    return Array.isArray(a[0]) ? (a as Intervals) : [a as [number, number]];
}

/** The key the parent test compares: block and fluid, rotations left out. */
export const blockKey = (block: string | null, fluid: string | null) => `${block ? block.split('|')[0] : ''}|${fluid ?? ''}`;

/** `ResolvedBlockArrayJsonLoader`: names, or `{ Block, Fluid }`. */
export function resolved(json: any): { block: string | null; fluid: string | null }[] {
    if (json === undefined || json === null) return [];
    const one = (e: any) => (typeof e === 'string' ? { block: e.split('|')[0]!, fluid: null } : { block: e.Block ? String(e.Block).split('|')[0]! : null, fluid: e.Fluid ?? null });
    return Array.isArray(json) ? json.map(one) : [one(json)];
}

export function loadCovers(json: any, load: Loader, biomePath: string, threshold: (j: JsonNode, path: string) => ThresholdLike): Cover[] {
    if (json === undefined || json === null) return [];
    const expand = (n: any): any => (n && n.File ? expand(load(n.File)) : n);
    const list: any[] = Array.isArray(json) ? json : [json];
    return list.map((raw, i) => {
        const e = expand(raw);
        const path = `${biomePath}-${i}.CoverContainerEntry`;
        if (e.Type === undefined) throw new Error('Could not find type array for cover container! Keyword: Type');
        const types = resolved(e.Type);
        const offsets: number[] = e.Offset === undefined ? types.map(() => 0) : Array.isArray(e.Offset) ? e.Offset : types.map(() => e.Offset);
        if (offsets.length !== types.length) throw new Error('Offset array size does not equal size of types array');
        if (e.Weight && e.Weight.length !== types.length) throw new Error('Weight array size does not equal size of types array');
        const weights: number[] = types.map((_, k) => (e.Weight ? e.Weight[k] : 1)); // the game reads `Weight` only, a `Weights` key is ignored
        if (!types.length) throw new Error('There are no blocks in this cover container!');

        let mask: Cover['mask'] = null;
        const nm = expand(e.NoiseMask);
        if (nm) {
            if (nm.Threshold === undefined) throw new Error('Could not find threshold data in noise mask. Keyword: Threshold');
            const noise = compileField(nm, load, { root: WORLD_ROOT, path: `${path}.NoiseMaskCondition` });
            const test = intervals(nm.Threshold);
            mask = (s, x, z) => { const v = noise(s, x, z); return test.some(([lo, hi]) => lo <= v && v <= hi); };
        }
        let height: Cover['height'] = null;
        if (e.HeightThreshold) {
            const ht = threshold(expand(e.HeightThreshold), path);
            height = (s, x, z, y, random) => {
                const t = ht.at(s, x, z, y, ht.context(s, x, z));
                return t > 0 && (t >= 1 || t > random.nextDouble());
            };
        }
        return {
            parts: types.map((t, k) => ({ ...t, offset: offsets[k]! })),
            weights, total: weights.reduce((a, b) => a + b, 0),
            mask, height,
            parent: e.Parent === undefined ? null : new Set(resolved(e.Parent).map((p) => blockKey(p.block, p.fluid))),
            density: e.Density ?? 1,
            onWater: e.OnWater === true
        };
    });
}

/** `WeightedMap.get(Random)`. */
export function pickPart(cover: Cover, random: FastRandom): CoverPart {
    let left = Math.min(random.nextDouble(), 0.99999) * cover.total;
    for (let i = 0; i < cover.parts.length; i++) {
        left -= cover.weights[i]!;
        if (left <= 9.99999999995449e-6) return cover.parts[i]!;
    }
    return cover.parts[cover.parts.length - 1]!; // the game returns null here and fails later
}
