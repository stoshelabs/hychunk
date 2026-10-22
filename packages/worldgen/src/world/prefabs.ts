import { seedOf, WORLD_ROOT, type JsonNode, type Loader } from '../noise/graph';
import { loadPointGenerator, type PointGenerator } from '../noise/points';
import { FastRandom } from '../noise/fastrandom';
import { hash3, random3 } from '../noise/hash';
import { blockKey, pickPart, resolved, type Cover } from './covers';
import { maskOf } from './layers';
import type { PrefabCatalog, PrefabVariant } from './prefabCatalog';

// The structures a biome repeats (`PrefabContainer`, `PrefabPopulator`): where the game would put each one, found
// without building any terrain. Written from the loaders and `PrefabPopulator.collectPrefab`.

/** What a pattern needs from the height thresholds (the shape `gen.ts` builds). */
export interface ThresholdLike {
    lowestNonOne: number;
    highestNonZero: number;
    context(seed: number, x: number, z: number): number;
    at(seed: number, x: number, z: number, y: number, context: number): number;
}

export interface PrefabPattern {
    seedOffset: number;
    grid: PointGenerator;
    /** Patterns with the same key put their points in the same places, so one search serves them all. */
    gridKey: string;
    mask: ReturnType<typeof maskOf>;
    interpreter: ThresholdLike | null;
    parent: Set<string> | null;
    /** `[0, 90, 180, 270]` steps to choose from. */
    rotations: number[];
    displacement: ((v: number) => number) | null;
    onWater: boolean;
    deepSearch: boolean;
    fitHeightmap: boolean;
    submerge: boolean;
    exclusionRadius: number;
}

export interface PrefabEntry {
    /** The `Prefab` names as the biome file gives them (`Monuments.Challenge.Volcanic.*`). */
    keys: string[];
    variants: PrefabVariant[];
    weights: number[];
    total: number;
    pattern: PrefabPattern;
}

const ROTATIONS: Record<string, number> = { ROTATION_0: 0, ROTATION_90: 1, ROTATION_180: 2, ROTATION_270: 3 };

/** `DoubleRangeJsonLoader` with a random value in place of a noise: a number, `[a, b]`, or `{ Min, Max }`. */
function randomRange(json: any): (v: number) => number {
    if (typeof json === 'number') return () => json;
    const [lo, hi] = Array.isArray(json) ? (json.length === 1 ? [json[0], json[0]] : json) : [json.Min, json.Max];
    return (v) => lo + (hi - lo) * v;
}

export function loadPrefabs(json: any, load: Loader, biomePath: string, catalog: PrefabCatalog, threshold: (j: JsonNode, path: string) => ThresholdLike): PrefabEntry[] {
    if (!json) return [];
    const expand = (n: any): any => (n && n.File ? expand(load(n.File)) : n);
    const container = expand(json);
    const base = `${biomePath}.PrefabContainer`;
    return ((container.Entries ?? []) as any[]).map((raw, i) => {
        const e = expand(raw);
        const at = `${base}-${i}.PrefabContainerEntry`;
        const keys: string[] = ([] as string[]).concat(e.Prefab ?? []);
        if (!keys.length) throw new Error('Could not find prefab names. Keyword: Prefab');
        if (e.Weight && e.Weight.length !== keys.length) throw new Error('Weight array size is different from prefab name array.');
        const variants: PrefabVariant[] = [], weights: number[] = [];
        keys.forEach((k, ki) => {
            const found = catalog.resolve(k);
            for (const v of found) { variants.push(v); weights.push(e.Weight ? e.Weight[ki] / found.length : 1); }
        });
        if (!e.Pattern) throw new Error('Could not find prefab pattern. Keyword: Pattern');
        const p = expand(e.Pattern);
        const pat = `${at}.PrefabPatternGenerator`;
        if (p.GridGenerator === undefined) throw new Error('Could not find point generator to place prefabs at! Keyword: GridGenerator');
        if (Array.isArray(p.BaseChecks) && p.BaseChecks.length) throw new Error('Prefab BaseChecks are not supported yet');
        if (p.DeepSearch && !p.HeightThreshold) throw new Error('DeepSearch is enabled but HeightThreshold is not set!');
        const pattern: PrefabPattern = {
            seedOffset: seedOf(pat),
            grid: loadPointGenerator(expand(p.GridGenerator), load, { root: WORLD_ROOT, path: pat }),
            gridKey: JSON.stringify(expand(p.GridGenerator)) + (expand(p.GridGenerator).Seed === undefined ? pat : ''),
            mask: maskOf(expand(p.NoiseMask), load, pat),
            interpreter: p.HeightThreshold ? threshold(expand(p.HeightThreshold), pat) : null,
            parent: p.Parent === undefined ? null : new Set(resolved(expand(p.Parent)).map((r) => blockKey(r.block, r.fluid))),
            rotations: p.Rotations === undefined ? [0, 1, 2, 3] : ([] as string[]).concat(p.Rotations).map((r) => {
                const v = ROTATIONS[r];
                if (v === undefined) throw new Error(`Could not find rotation "${r}"`);
                return v;
            }),
            displacement: p.Displacement === undefined ? null : randomRange(p.Displacement),
            onWater: !!p.OnWater,
            deepSearch: !!p.DeepSearch,
            fitHeightmap: !!p.FitHeightmap,
            submerge: !!p.Submerge,
            exclusionRadius: p.ExclusionRadius ?? 0
        };
        return { keys, variants, weights, total: weights.reduce((a, b) => a + b, 0), pattern };
    });
}

// ---- finding the places ----

export interface SiteBiome {
    id: number;
    name: string;
    zone: string;
    prefabs: PrefabEntry[];
    covers: Cover[];
    water: { max(seed: number, x: number, z: number): number; min(seed: number, x: number, z: number): number }[];
}

/** What the search needs from the generator (`TerrainGen` builds it). */
export interface SiteWorld {
    seed: number;
    biomeAt(x: number, z: number): SiteBiome;
    heightAt(x: number, z: number): number;
    /** `ChunkGenerator.generateHeightBetween`. */
    heightBetween(x: number, z: number, interpreter: ThresholdLike): number;
    /** `LayerContainer.getTopBlockAt` for the biome at the column. */
    topBlock(biome: SiteBiome, x: number, z: number): string;
    /** The unique structures' positions: repeated ones keep away from them. */
    uniques: { x: number; z: number }[];
}

export interface PrefabSite {
    x: number;
    y: number;
    z: number;
    /** The prefab's name, down to the variant. */
    name: string;
    /** The `Prefab` key of the biome entry it came from. */
    key: string;
    rotation: number;
    biome: string;
    zone: string;
    onWater: boolean;
    /** Footprint after rotation, relative to the position: `[minX, maxX, minZ, maxZ]`. */
    footprint: [number, number, number, number];
    /** The weighted draw that chose the variant: `[position, total weight, whether every variant weighs the same]`. */
    draw: [number, number, boolean];
    /** The spawn markers inside the structure, by name (`Trork_Brawler`, `Klops_Gentleman`). */
    spawns: string[];
    /** Blocks the map marks on their own (portals), in world coordinates. */
    marks: { block: string; x: number; y: number; z: number }[];
}

/** `PrefabRotation` on a block offset: 90 turns (x, z) to (z, -x). */
export function rotateXZ(x: number, z: number, rotation: number): [number, number] {
    return rotation === 0 ? [x, z] : rotation === 1 ? [z, -x] : rotation === 2 ? [-x, -z] : [-z, x];
}

export const rotatedFootprint = (b: [number, number, number, number, number, number], turns: number) => rotateBounds(b, turns);

function rotateBounds(b: [number, number, number, number, number, number], rotation: number): [number, number, number, number] {
    const [minX, maxX, , , minZ, maxZ] = b;
    const rot = (x: number, z: number): [number, number] => rotateXZ(x, z, rotation);
    const xs: number[] = [], zs: number[] = [];
    for (const [x, z] of [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]] as const) {
        const [rx, rz] = rot(x, z);
        xs.push(rx); zs.push(rz);
    }
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}

const MIN_INT = -2147483648;

/** `PrefabPopulator.collectPrefab` for every point of every pattern whose point falls in the box. */
export function collectSites(world: SiteWorld, biomes: SiteBiome[], rect: { minX: number; minZ: number; maxX: number; maxZ: number }, accept?: (key: string) => boolean, coarse = 0): PrefabSite[] {
    const { seed } = world;
    const out: PrefabSite[] = [];
    const random = new FastRandom(0);
    const found = new Map<string, Map<SiteBiome, [number, number][]>>();
    const biomeCache = new Map<number, SiteBiome>();
    const exactBiome = (x: number, z: number) => {
        const k = x * 4194304 + z;
        let b = biomeCache.get(k);
        if (!b) { b = world.biomeAt(x, z); biomeCache.set(k, b); }
        return b;
    };
    // `coarse`: a point inside a cell of that many blocks whose four corners are in one biome is taken to be in it too. Biomes
    // are patches far larger than the cell, so only the cells on a border are looked at point by point; a sliver narrower than
    // the cell can be missed, which costs a tree in a stream, nothing else (each point's random numbers are its own).
    const biomeAt = coarse > 1 ? (x: number, z: number) => {
        const qx = Math.floor(x / coarse), qz = Math.floor(z / coarse);
        const a = exactBiome(qx * coarse, qz * coarse), b = exactBiome(qx * coarse + coarse, qz * coarse);
        if (a === b) {
            const c = exactBiome(qx * coarse, qz * coarse + coarse), d = exactBiome(qx * coarse + coarse, qz * coarse + coarse);
            if (a === c && a === d) return a;
        }
        return exactBiome(x, z);
    } : exactBiome;
    // With `coarse`, only the biomes seen on a sample of the box are searched: most of the 260 biomes are not in a given square.
    let present: Set<SiteBiome> | null = null;
    if (coarse > 1) {
        present = new Set();
        for (let z = rect.minZ; z <= rect.maxZ + coarse; z += coarse) for (let x = rect.minX; x <= rect.maxX + coarse; x += coarse) present.add(exactBiome(Math.min(x, rect.maxX), Math.min(z, rect.maxZ)));
    }
    for (const biome of biomes) {
        if (present && !present.has(biome)) continue;
        let id = 0;
        for (const entry of biome.prefabs) {
            id++;
            if (accept && !entry.keys.some(accept)) continue;
            const p = entry.pattern;
            const prefabSeed = hash3(seed, biome.id, id);
            // The points of a grid are sorted by biome once, however many patterns share the grid: a pattern only visits the
            // points that lie in its own biome.
            let grouped = found.get(p.gridKey);
            if (!grouped) {
                grouped = new Map();
                p.grid.collect(seed, rect.minX, rect.minZ, rect.maxX, rect.maxZ, (px, pz) => {
                    const x = Math.floor(px), z = Math.floor(pz);
                    if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) return;
                    const b = biomeAt(x, z);
                    let list = grouped!.get(b);
                    if (!list) grouped!.set(b, (list = []));
                    list.push([x, z]);
                });
                found.set(p.gridKey, grouped);
            }
            for (const [x, z] of grouped.get(biome) ?? []) {
                if (p.mask && !p.mask(seed, x, z)) continue; // does not touch the random numbers
                if (coarse > 1 && exactBiome(x, z) !== biome) continue; // the coarse cell may have been wrong about this point
                random.setSeed(BigInt.asIntN(64, hash3(prefabSeed, x, z) * 1609272495n));
                if (p.exclusionRadius > 0) {
                    const r2 = p.exclusionRadius * p.exclusionRadius;
                    if (world.uniques.some((u) => (x - u.x) ** 2 + (z - u.z) ** 2 <= r2)) continue;
                }
                // WeightedMap.get(random)
                let left = Math.min(random.nextDouble(), 0.99999) * entry.total;
                const position = left;
                let variant: PrefabVariant | undefined, which = entry.variants.length - 1;
                for (let i = 0; i < entry.variants.length; i++) {
                    left -= entry.weights[i]!;
                    if (left <= 9.99999999995449e-6) { variant = entry.variants[i]; which = i; break; }
                }
                if (!variant) continue;
                const rotation = entry.pattern.rotations[random.nextInt(entry.pattern.rotations.length)]!;

                let y: number;
                const heightOk = (h: number) => {
                    const t = p.interpreter!;
                    const th = t.at(seed, x, z, h, t.context(seed, x, z));
                    return th > 0 && (th >= 1 || th > random.nextDouble());
                };
                if (p.onWater && p.deepSearch) {
                    y = MIN_INT;
                    for (const w of biome.water) {
                        const max = Math.floor(w.max(seed, x, z));
                        if (!Number.isFinite(max) || !heightOk(max)) continue;
                        y = max;
                        break;
                    }
                } else if (p.onWater) {
                    let top = MIN_INT;
                    for (const w of biome.water) {
                        const min = Math.floor(w.min(seed, x, z)), max = Math.floor(w.max(seed, x, z));
                        if (min > max || max <= top) continue;
                        top = max;
                    }
                    y = top < 0 ? MIN_INT : top;
                } else {
                    y = p.deepSearch ? world.heightBetween(x, z, p.interpreter!) : world.heightAt(x, z);
                }
                if (y === MIN_INT) continue;
                if (p.displacement) y += Math.floor(p.displacement(random3(seed + p.seedOffset, x, z)));

                if (p.interpreter && !heightOk(y)) continue;

                if (p.parent) {
                    // The cover that would sit one block into the ground counts as the ground, then the top layer.
                    let ground: string | null = null;
                    if (y < 320) {
                        for (const c of biome.covers) {
                            if (!(random.nextDouble() < c.density && (!c.mask || c.mask(seed, x, z)) && (!c.height || c.height(seed, x, z, y, random)))) continue;
                            const part = pickPart(c, random);
                            if (part.offset !== -1) continue;
                            ground = blockKey(part.block, part.fluid);
                            break;
                        }
                    }
                    if (ground !== null && ground !== '|' && !p.parent.has(ground)) continue;
                    if (!p.parent.has(blockKey(world.topBlock(biome, x, z), null))) continue;
                }

                out.push({
                    x, y, z, name: variant.name, key: entry.keys[0]!, rotation: rotation * 90, biome: biome.name, zone: biome.zone,
                    onWater: p.onWater, footprint: rotateBounds(variant.bounds, rotation),
                    draw: [position, entry.total, entry.weights.every((w) => w === entry.weights[0])],
                    spawns: variant.spawns,
                    marks: variant.marks.map((m) => { const [rx, rz] = rotateXZ(m.x, m.z, rotation); return { block: m.block, x: x + rx, y: y + m.y, z: z + rz }; })
                });
                void which;
            }
        }
    }
    return out;
}
