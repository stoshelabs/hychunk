import { random3, hash3Low } from '../noise/hash';
import { compileField, seedOf, WORLD_ROOT, type Field, type JsonNode, type Loader } from '../noise/graph';
import { loadPointGenerator, type PointGenerator } from '../noise/points';
import { loadClimateMask, type ClimateMask } from './climate';
import type { Source } from './source';
import { loadCovers, pickPart, blockKey, type Cover } from './covers';
import { FastRandom } from '../noise/fastrandom';
import { hash4 } from '../noise/hash';
import { DECOR_PREFABS, MONUMENT_PREFABS, type PrefabBounds } from './prefabCatalog';
import {
    loadPrefabs,
    collectSites,
    rotatedFootprint,
    rotateXZ,
    type PrefabEntry,
    type PrefabSite,
    type SiteBiome,
    type SiteWorld
} from './prefabs';
import type { PrefabCatalog } from './prefabCatalog';
import { loadCaveTypes, collectCaveEntries, type CaveType, type CaveEntry } from './caves';
import { dynamicTopBlock, loadLayers, topOfColumn, type Layers, type Top } from './layers';

// The world generator up to the height of each column: which zone and biome a block column is in,
// how biomes blend at their borders, and where the ground is. Written from the game's
// `ChunkGenerator`, `ZonePatternGenerator`, `BiomePatternGenerator` and the loaders that feed them.

const f32 = Math.fround;
const hex = (s: string) => parseInt(s.replace('#', '').replace('0x', ''), 16) & 0xffffff;
const limit = (d: number) => (d < 0 ? 0 : d > 1 ? 1 : d);
const bitsOf = (() => {
    const view = new DataView(new ArrayBuffer(8));
    return (d: number): bigint => {
        view.setFloat64(0, d);
        return view.getBigUint64(0);
    };
})();

// ---- height thresholds ----

export interface HeightThreshold {
    lowestNonOne: number;
    highestNonZero: number;
    length: number;
    context(seed: number, x: number, z: number): number;
    at(seed: number, x: number, z: number, y: number, context: number): number;
}

const flerp = (from: number, to: number, t: number) => f32(from + f32(f32(to - from) * t));

function basicThreshold(json: JsonNode, length: number): HeightThreshold {
    const positions = json.Positions as number[];
    const values = (json.Values as number[]).map(f32);
    if (positions.length !== values.length) throw new Error('Mismatching height threshold arrays');
    const table = new Float32Array(length);
    for (let y = 0; y < length; y++) {
        let t = values[values.length - 1]!;
        for (let i = 0; i < positions.length; i++) {
            if (y >= positions[i]!) continue;
            if (i === 0) {
                t = values[0]!;
                break;
            }
            const d = f32(f32(y - positions[i - 1]!) / f32(positions[i]! - positions[i - 1]!));
            t = flerp(values[i - 1]!, values[i]!, d);
            break;
        }
        table[y] = t;
    }
    let lowestNonOne = 0;
    while (lowestNonOne < length && !(table[lowestNonOne]! < 1)) lowestNonOne++;
    let highestNonZero = length - 1;
    while (highestNonZero >= 0 && !(table[highestNonZero]! > 0)) highestNonZero--;
    return {
        lowestNonOne,
        highestNonZero,
        length,
        context: () => 0,
        at(_s, _x, _z, y) {
            if (y > highestNonZero) return 0;
            if (y < 0) y = 0;
            if (y >= length) y = length - 1;
            return table[y]!;
        }
    };
}

function noiseThreshold(json: JsonNode, length: number, load: Loader, path: string): HeightThreshold {
    const noise = compileField(json.Noise, load, { root: WORLD_ROOT, path: `${path}.NoiseHeightThresholdInterpreter` });
    const keys = (json.Keys as number[]).map(f32);
    const values = (json.Thresholds as JsonNode[]).map((n, i) =>
        heightThreshold(n, length, load, `${path}.NoiseHeightThresholdInterpreter-${i}`)
    );
    if (keys.length !== values.length) throw new Error('Keys and Thresholds do not have the same length');
    // As the game computes them: the lowest starts from 0 and the highest from length - 1.
    let lowestNonOne = 0;
    for (const v of values) if (v.lowestNonOne < lowestNonOne) lowestNonOne = v.lowestNonOne;
    let highestNonZero = values[0]!.length - 1;
    for (const v of values) if (v.highestNonZero > highestNonZero) highestNonZero = v.highestNonZero;
    return {
        lowestNonOne,
        highestNonZero,
        length: values[0]!.length,
        context: (s, x, z) => noise(s, x, z),
        at(seed, x, z, y, context) {
            if (y > highestNonZero) return 0;
            const n = keys.length;
            for (let i = 0; i < n; i++) {
                if (!(context <= keys[i]!)) continue;
                if (i === 0) return values[0]!.at(seed, x, z, y, values[0]!.context(seed, x, z));
                const d = f32(f32(f32(context) - keys[i - 1]!) / f32(keys[i]! - keys[i - 1]!));
                const lo = values[i - 1]!,
                    hi = values[i]!;
                return flerp(
                    lo.at(seed, x, z, y, lo.context(seed, x, z)),
                    hi.at(seed, x, z, y, hi.context(seed, x, z)),
                    d
                );
            }
            const last = values[n - 1]!;
            return last.at(seed, x, z, y, last.context(seed, x, z));
        }
    };
}

function heightThreshold(json: JsonNode, length: number, load: Loader, path: string): HeightThreshold {
    const p = `${path}.HeightThresholdInterpreter`;
    return json.Thresholds !== undefined ? noiseThreshold(json, length, load, p) : basicThreshold(json, length);
}

// ---- thresholds on noise values (custom biome masks) ----

type Interval = [number, number];
function intervals(d: unknown): Interval[] {
    if (d === undefined || d === null) return [[-Infinity, Infinity]];
    if (typeof d === 'number') return [[0, d]];
    const a = d as unknown[];
    return Array.isArray(a[0]) ? (a as Interval[]) : [a as Interval];
}
const inside = (list: Interval[], v: number) => list.some(([lo, hi]) => lo <= v && v <= hi);
const insideFaded = (list: Interval[], v: number, factor: number) =>
    list.some(([lo, hi]) => {
        const half = (hi - lo) * 0.5;
        return lo + half * factor <= v && v <= hi - half * factor;
    });

// ---- biomes and zones ----

export interface Fade {
    maskStart: number;
    maskLength: number;
    maskSum: number;
    terrainStart: number;
    terrainLength: number;
    fadeHeightmap: number;
}

export interface WaterEntry {
    /** The fluid, or the block a `Block` entry fills with. */
    fluid: string | null;
    block: string | null;
    min: (seed: number, x: number, z: number) => number;
    max: (seed: number, x: number, z: number) => number;
    mask: ((seed: number, x: number, z: number) => boolean) | null;
}

export interface Biome {
    /** The game's number for it: files in order, zone by zone, tile biomes before custom ones. */
    id: number;
    name: string;
    zone: string;
    custom: boolean;
    weight: number;
    /** Already squared, as the game keeps it. */
    sizeMod: number;
    mapColor: number;
    interpolation: { radius: number; radius2: (name: string) => number };
    threshold: HeightThreshold;
    heightNoise: Field;
    fade: Fade;
    water: WaterEntry[];
    /** `TintContainer.getTintColorAt`: 0xRRGGBB for a column, before the blending across neighbours. */
    tint: (seed: number, x: number, z: number) => number;
    /** `EnvironmentContainer.getEnvironmentAt`: the environment's name (`Env_Zone1_Plains`) for a column. */
    environment: (seed: number, x: number, z: number) => string;
    layers: Layers;
    covers: Cover[];
    prefabs: PrefabEntry[];
    json: JsonNode;
    generator?: { noise: Field; threshold: Interval[]; parents: Set<string> | null; priority: number; fade: Fade };
}

/** One entry of a zone's `UniquePrefabs`: a structure the generator places once (spawn, temple). */
/** What drawing a structure needs of a site (small enough to hand over between threads). */
export interface SiteShape {
    x: number;
    y: number;
    z: number;
    name: string;
    rotation: number;
    footprint: [number, number, number, number];
}

export interface UniquePrefabDef {
    name: string;
    prefabs: string[];
    /** `Weights` of the `Prefab` names, when given. */
    weights?: number[];
    /** Quarter turns the structure may take (0 when the config has no `Rotations`). */
    rotations: number[];
    onWater: boolean;
    isSpawn: boolean;
    showOnMap: boolean;
}

/** Where such a structure ends up in a world. */
export interface UniquePrefabSpot extends UniquePrefabDef {
    /** The variant the game's random numbers chose (needs the prefab catalog) and its turn in degrees. */
    variant?: string;
    rotation?: number;
    /** Footprint of that variant after the turn, relative to the spot: `[minX, maxX, minZ, maxZ]`. */
    footprint?: [number, number, number, number];
    /** Blocks of that variant the map marks on their own (the portal of a temple), in world coordinates. */
    marks?: { block: string; x: number; y: number; z: number }[];
    zone: string;
    x: number;
    /** The ground (or water) level at the spot. */
    y: number;
    z: number;
}

export interface Zone {
    /** The seed name of the zone's unique prefab container (its random numbers start from it). */
    uniquePath: string;
    caves: CaveType[];
    uniquePrefabs: UniquePrefabDef[];
    name: string;
    tiles: Biome[];
    customs: Biome[];
    pickBiome(seed: number, x: number, z: number, borderDistance: number): Biome;
}

const FADE_NONE = -Infinity;

/** A number, or `[min, max]` moved along by a noise: `DoubleRangeNoiseSupplier`. */
function rangeSupplier(range: unknown, noise: Field | null): (seed: number, x: number, z: number) => number {
    if (range === undefined) return () => 0;
    if (typeof range === 'number') return () => range;
    const a = range as number[];
    if (a.length === 1) return () => a[0]!;
    const lo = a[0]!,
        span = a[1]! - a[0]!;
    return noise ? (seed, x, z) => lo + span * noise(seed, x, z) : () => lo;
}

function loadWater(json: JsonNode | undefined, load: Loader, path: string): WaterEntry[] {
    if (!json) return [];
    const entry = (j: JsonNode, at: string): WaterEntry => {
        const field = (key: string) =>
            j[key] ? compileField(j[key], load, { root: WORLD_ROOT, path: `${at}.Entry` }) : null;
        const mask = j.NoiseMask
            ? compileField(j.NoiseMask, load, { root: WORLD_ROOT, path: `${at}.Entry.NoiseMaskCondition` })
            : null;
        const test = j.NoiseMask ? intervals(j.NoiseMask.Threshold) : null;
        return {
            fluid: j.Fluid ?? null,
            block: j.Block ?? null,
            min: rangeSupplier(j.Min, field('MinNoise')),
            max: rangeSupplier(j.Max, field('MaxNoise')),
            mask: mask && test ? (s, x, z) => inside(test, mask(s, x, z)) : null
        };
    };
    const base = `${path}.WaterContainer`;
    if (json.Block !== undefined || json.Fluid !== undefined) {
        const noise = json.Heightmap ? compileField(json.Heightmap, load, { root: WORLD_ROOT, path: base }) : null;
        return [
            {
                fluid: json.Fluid ?? null,
                block: json.Block ?? null,
                min: () => 0,
                max: rangeSupplier(json.Height ?? 0, noise),
                mask: null
            }
        ];
    }
    return ((json.Entries ?? []) as JsonNode[]).map((e, i) => entry(e, `${base}-${i}`));
}

/** `TintContainer`: the first entry whose noise mask accepts the column picks a colour by weight from its noise; else the default. */
function loadTint(json: JsonNode | undefined | null, load: Loader, path: string): Biome['tint'] {
    const hex = (v: unknown) => parseInt(String(v).replace('#', '').replace('0x', ''), 16) & 0xffffff;
    const mapping = (j: JsonNode | string | null | undefined, at: string, isDefault: boolean) => {
        const colors: number[] = [],
            weights: number[] = [];
        if (j === undefined || j === null) {
            colors.push(0xff0000);
            weights.push(1);
        } else if (typeof j === 'string') {
            colors.push(hex(j));
            weights.push(1);
        } else {
            if (j.Colors === undefined) throw new Error('Could not find colors. Keyword: Colors');
            if (Array.isArray(j.Colors)) {
                if (j.Weights && j.Weights.length !== j.Colors.length)
                    throw new Error('Tint weights array size does not fit color array size.');
                j.Colors.forEach((c: unknown, i: number) => {
                    colors.push(hex(c));
                    weights.push(j.Weights ? j.Weights[i] : 1);
                });
            } else {
                colors.push(hex(j.Colors));
                weights.push(1);
            }
        }
        const total = weights.reduce((a, b) => a + b, 0);
        // `WeightedMap.get`: the same walk the zones use for their tile biomes.
        const pick = (value: number) => {
            let left = Math.min(value, 0.99999) * total;
            for (let i = 0; i < colors.length; i++) {
                left -= weights[i]!;
                if (left <= 9.99999999995449e-6) return colors[i]!;
            }
            return undefined as unknown as number;
        };
        const noise: Field | null =
            colors.length > 1
                ? (() => {
                      if (!j || typeof j === 'string' || !j.Noise)
                          throw new Error('Could not find value noise. Keyword: Noise');
                      return compileField(j.Noise, load, { root: WORLD_ROOT, path: at });
                  })()
                : null;
        void isDefault;
        return (seed: number, x: number, z: number) => pick(noise ? noise(seed, x, z) : 0);
    };
    const base = `${path}.TintContainer`;
    const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : null;
    const defJson =
        json === undefined || json === null || Array.isArray(json)
            ? null
            : obj && obj.Default !== undefined
              ? obj.Default
              : json;
    const def = mapping(defJson, `${base}.DefaultTintContainerEntry`, true);
    const entries = ((obj?.Entries ?? []) as JsonNode[]).map((e, i) => {
        const at = `${base}-${i}.TintContainerEntry`;
        const pick = mapping(e, at, false);
        const test = e.NoiseMask ? intervals(e.NoiseMask.Threshold) : null;
        const mask = e.NoiseMask
            ? compileField(e.NoiseMask, load, { root: WORLD_ROOT, path: `${at}.NoiseMaskCondition` })
            : null;
        return { pick, ok: (s: number, x: number, z: number) => !mask || !test || inside(test, mask(s, x, z)) };
    });
    return (seed, x, z) => {
        for (const e of entries) if (e.ok(seed, x, z)) return e.pick(seed, x, z);
        return def(seed, x, z);
    };
}

/**
 * `EnvironmentContainer`: the same shape as the tint container, with environment names for colours: the first entry whose
 * noise mask accepts the column picks a name by weight from its noise; else the default.
 */
function loadEnvironment(
    json: JsonNode | undefined | null,
    load: Loader,
    path: string
): (seed: number, x: number, z: number) => string {
    const mapping = (j: JsonNode | string | null | undefined, at: string) => {
        const names: string[] = [],
            weights: number[] = [];
        if (j === undefined || j === null) {
            names.push('');
            weights.push(1);
        } else if (typeof j === 'string') {
            names.push(j);
            weights.push(1);
        } else {
            if (j.Names === undefined) throw new Error('Could not find names. Keyword: Names');
            if (Array.isArray(j.Names)) {
                if (j.Weights && j.Weights.length !== j.Names.length)
                    throw new Error('Environment weights array size does not fit names array size.');
                j.Names.forEach((n: string, i: number) => {
                    names.push(n);
                    weights.push(j.Weights ? j.Weights[i] : 1);
                });
            } else {
                names.push(j.Names);
                weights.push(1);
            }
        }
        const total = weights.reduce((a, b) => a + b, 0);
        const pick = (value: number) => {
            let left = Math.min(value, 0.99999) * total;
            for (let i = 0; i < names.length; i++) {
                left -= weights[i]!;
                if (left <= 9.99999999995449e-6) return names[i]!;
            }
            return names[names.length - 1]!;
        };
        const noise: Field | null =
            names.length > 1
                ? (() => {
                      if (!j || typeof j === 'string' || !j.Noise)
                          throw new Error('Could not find value noise. Keyword: Noise');
                      return compileField(j.Noise, load, { root: WORLD_ROOT, path: at });
                  })()
                : null;
        return (seed: number, x: number, z: number) => pick(noise ? noise(seed, x, z) : 0);
    };
    const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : null;
    const defJson =
        json === undefined || json === null || Array.isArray(json)
            ? null
            : obj && obj.Default !== undefined
              ? obj.Default
              : json;
    const def = mapping(defJson, `${path}.EnvironmentContainer`);
    const entries = ((obj?.Entries ?? []) as JsonNode[]).map((e, i) => {
        const at = `${path}-${i}.EnvironmentContainer`;
        const pick = mapping(e, at);
        const test = e.NoiseMask ? intervals(e.NoiseMask.Threshold) : null;
        const mask = e.NoiseMask
            ? compileField(e.NoiseMask, load, { root: WORLD_ROOT, path: `${at}.NoiseMaskCondition` })
            : null;
        return { pick, ok: (s: number, x: number, z: number) => !mask || !test || inside(test, mask(s, x, z)) };
    });
    return (seed, x, z) => {
        for (const e of entries) if (e.ok(seed, x, z)) return e.pick(seed, x, z);
        return def(seed, x, z);
    };
}

function loadFade(json: JsonNode | undefined): Fade {
    const f = json ?? {};
    const maskStart = f.FadeStart ?? 0,
        maskLength = f.FadeLength ?? 0;
    return {
        maskStart,
        maskLength,
        maskSum: maskStart + maskLength,
        terrainStart: f.TerrainStart ?? 0,
        terrainLength: f.TerrainLength ?? 0,
        fadeHeightmap: f.FadeHeightmap ?? FADE_NONE
    };
}
const fadeFactor = (border: number, start: number, length: number) => 1 - limit((border - start) / length);

/** `Tile.Name.json` / `Custom.Name.json`: tile biomes first, each kind in name order. */
function biomeFiles(src: Source, zoneDir: string): { name: string; file: string; custom: boolean }[] {
    const out: { name: string; file: string; custom: boolean }[] = [];
    for (const f of src.list(zoneDir)) {
        if (!f.endsWith('.json') || src.isDir(`${zoneDir}/${f}`)) continue;
        if (f.startsWith('Tile.')) out.push({ name: f.slice(5, -5), file: f, custom: false });
        else if (f.startsWith('Custom.')) out.push({ name: f.slice(7, -5), file: f, custom: true });
    }
    // Java compares names char by char (UTF-16 order), which is what `<` does.
    return out.sort((a, b) =>
        a.custom !== b.custom ? (a.custom ? 1 : -1) : a.file < b.file ? -1 : a.file > b.file ? 1 : 0
    );
}

export interface ZoneBiomeResult {
    zone: Zone;
    borderDistance: number;
    biome: Biome;
    heightThresholdContext: number;
    heightNoise: number;
}

interface CountEntry {
    biome: Biome;
    context: number;
    noise: number;
    count: number;
}
interface CountList {
    ids: Biome[];
    byBiome: Map<Biome, CountEntry>;
    center?: ZoneBiomeResult;
}

export interface TerrainGen {
    zoneBiomeAt(x: number, z: number): ZoneBiomeResult;
    /** The y of the highest solid block of the column, or 0. */
    heightAt(x: number, z: number): number;
    /** The surface of the fluid that fills the column's biome, and what it is, or null where the column is dry. */
    waterAt(x: number, z: number): { y: number; fluid: string } | null;
    /** The tint of a column (0xAARRGGBB): each biome's colour averaged over a disc of radius 4, as `generateTintMapping` does. */
    tintAt(x: number, z: number): number;
    /** The environment of a column, which the game's spawn tables are keyed by. */
    environmentAt(x: number, z: number): string;
    /** The biome of a column as `Zone/Name`: what a biome highlighter compares. */
    biomeKeyAt(x: number, z: number): string;
    /** The top of a column whose ground reaches `surface`: block, raised surface and any fluid a layer put there. */
    topAt(x: number, z: number, surface: number): Top;
    /**
     * Puts the biome covers on a chunk, as `BlockPopulator` does: `tops[(lz << 5) | lx]` is what `topAt` said of each column.
     * The random numbers are drawn column by column in the game's order, so the result has the game's pattern as far as the columns agree.
     */
    coverChunk(chunkX: number, chunkZ: number, tops: Top[]): Top[];
    /**
     * The repeated structures whose spot lies in the box (`PrefabPopulator`): trees, rocks and plants included unless `accept`
     * says which `Prefab` keys to look at. Needs the world to have been loaded with a prefab catalog.
     */
    /** The entry points of the zones' caves in the box (`CavePopulator`); what lies below the entry is not worked out. */
    caveEntries(
        rect: { minX: number; minZ: number; maxX: number; maxZ: number },
        accept?: (name: string) => boolean
    ): CaveEntry[];
    /** The drawn structures whose footprint reaches the chunk, worked out a square at a time and kept: the monuments, and with `decor` the trees, rocks and plants too. */
    chunkSites(cx: number, cz: number, decor?: boolean, shared?: SiteShape[]): PrefabSite[];
    /** The sites of one 512-block square of trees, rocks and plants (`decor`) or of monuments and camps, in a form that can be handed to another thread. */
    squareSites(qx: number, qz: number, decor: boolean): SiteShape[];
    prefabSites(
        rect: { minX: number; minZ: number; maxX: number; maxZ: number },
        accept?: (key: string) => boolean,
        coarse?: number
    ): PrefabSite[];
    uniques: ReturnType<ClimateMask['uniques']['slice']>;
    /** Every unique structure of the world (`generateUniquePrefabs`), in the game's order. */
    uniquePrefabs(): UniquePrefabSpot[];
}

export interface WorldGen {
    forSeed(seed: number): TerrainGen;
    zones: Zone[];
}

/** Whether a dotted game version such as `0.7.0` or `0.7.0-pre.5.1` is `min` or later. */
export function atLeastVersion(version: string, min: [number, number, number]): boolean {
    const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!parts) return false;
    for (let i = 0; i < 3; i++) {
        const v = Number(parts[i + 1]);
        if (v !== min[i]) return v > min[i]!;
    }
    return true;
}

export function loadWorldGen(src: Source, catalog?: PrefabCatalog): WorldGen {
    let nextBiomeId = 0;
    const load: Loader = (name) => src.read(`${name.replace(/\./g, '/')}.json`);
    // A data pack names its game version in `Game.json`; files that do not (a bare Assets folder) are read as before 0.7.0.
    if (src.exists('Game.json'))
        load.minMaxSkipsFirst = atLeastVersion(String(src.read('Game.json').gameVersion ?? ''), [0, 7, 0]);
    const world = src.read('World.json');
    const maskFile: string = Array.isArray(world.Masks) && world.Masks.length ? world.Masks[0] : 'Mask.json';
    if (!maskFile.endsWith('Mask.json'))
        throw new Error(`Mask file ${maskFile} is not supported: only a climate Mask.json is`);
    const climate = loadClimateMask(src.read(maskFile), load);
    const zonesJson = src.read('Zones.json');

    // Which zones the mask can produce, and how a mask colour maps to them.
    const mapping = new Map<number, string[]>();
    const required = new Set<string>();
    for (const [color, v] of Object.entries(zonesJson.MaskMapping as Record<string, string | string[]>)) {
        const names = Array.isArray(v) ? v : [v];
        mapping.set(hex(color), names);
        names.forEach((n) => required.add(n));
    }
    const zonePoints = loadPointGenerator(zonesJson.GridGenerator, load, {
        root: WORLD_ROOT,
        path: `${WORLD_ROOT}.ZonePatternGenerator`
    });

    const zoneNames = src
        .list('Zones')
        .filter((n) => src.isDir(`Zones/${n}`) && src.exists(`Zones/${n}/Zone.json`) && required.has(n))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const n of required) if (!zoneNames.includes(n)) throw new Error(`Missing zone ${n}`);

    const zones = new Map<string, Zone>();
    const raw = new Map<
        string,
        { tiles: { name: string; json: JsonNode }[]; customs: { name: string; json: JsonNode }[]; zone: JsonNode }
    >();
    for (const name of zoneNames) {
        const dir = `Zones/${name}`;
        const files = biomeFiles(src, dir);
        raw.set(name, {
            zone: src.read(`${dir}/Zone.json`),
            tiles: files.filter((f) => !f.custom).map((f) => ({ name: f.name, json: src.read(`${dir}/${f.file}`) })),
            customs: files.filter((f) => f.custom).map((f) => ({ name: f.name, json: src.read(`${dir}/${f.file}`) }))
        });
    }

    const radiusMap = (zone: string, interp: JsonNode | undefined) => {
        const radius: number = interp?.DefaultRadius ?? 5;
        const radii = new Map<string, number>();
        for (const entry of (interp?.Biomes ?? []) as JsonNode[]) {
            const r: number = entry.Radius;
            if (r === radius) continue;
            for (const n of maskNames(entry.Mask as string[], zone)) {
                if (radii.has(n)) throw new Error('Duplicate biome detected in interpolation rules');
                radii.set(n, r * r);
            }
        }
        if (!interp || (radius === 5 && radii.size === 0)) return { radius: 5, radius2: () => 25 };
        if (radii.size === 0) return { radius, radius2: () => 25 };
        return { radius, radius2: (name: string) => radii.get(name) ?? radius * radius };
    };
    // BiomeMask rules: `Name`, `Zone.Name`, `*`, optionally ending in `#Tile` or `#Custom`.
    const maskNames = (rules: string[], here: string): string[] => {
        const out: string[] = [];
        for (const rule of rules) {
            const dot = rule.indexOf('.'),
                hash = rule.indexOf('#');
            const zone = dot > 0 ? rule.slice(0, dot) : here;
            const name = rule.slice(dot + 1, hash > dot ? hash : rule.length);
            const type = hash > 0 ? rule.slice(hash + 1) : null;
            const z = raw.get(zone);
            if (!z) throw new Error(`BiomeMask rule '${rule}': no zone ${zone}`);
            const pool = type === 'Tile' ? z.tiles : type === 'Custom' ? z.customs : [...z.tiles, ...z.customs];
            const hit = pool.filter((b) => name === '*' || b.name === name).map((b) => b.name);
            if (!hit.length) throw new Error(`BiomeMask rule '${rule}' matches nothing`);
            out.push(...hit);
        }
        return out;
    };

    for (const zoneName of zoneNames) {
        const r = raw.get(zoneName)!;
        const zonePath = `${WORLD_ROOT}.Zones.Zone-${zoneName}`;
        const make = (b: { name: string; json: JsonNode }, custom: boolean): Biome => {
            const j = b.json;
            const path = custom ? `${zonePath}TileBiome-${b.name}` : `${zonePath}.TileBiome-${b.name}`; // the game leaves the dot out for custom biomes
            const sizeModifier: number = j.SizeModifier ?? 1;
            const biome: Biome = {
                id: nextBiomeId++,
                name: b.name,
                zone: zoneName,
                custom,
                weight: j.Weight ?? 1,
                sizeMod: sizeModifier * sizeModifier,
                mapColor: j.MapColor !== undefined ? parseInt(String(j.MapColor).replace(/0x|#/, ''), 16) : 0xff0000,
                interpolation: radiusMap(zoneName, j.Interpolation),
                threshold: heightThreshold(j.TerrainHeightThreshold, 320, load, path),
                heightNoise: j.HeightmapNoise
                    ? compileField(j.HeightmapNoise, load, { root: WORLD_ROOT, path })
                    : () => {
                          throw new Error(`Biome ${b.name} has no HeightmapNoise`);
                      },
                fade: loadFade(j.Fade),
                water: loadWater(j.Water, load, path),
                tint: loadTint(j.Tint, load, path),
                environment: loadEnvironment(j.Environment, load, path),
                layers: loadLayers(j.Layers ?? { Default: 'Empty' }, load, path),
                prefabs:
                    catalog && j.Prefabs
                        ? loadPrefabs(j.Prefabs, load, path, catalog, (t, p) => heightThreshold(t, 320, load, p))
                        : [],
                covers: loadCovers(j.Covers, load, path, (t, p) => heightThreshold(t, 320, load, p)),
                json: j
            };
            if (custom && j.CustomBiomeGenerator) {
                const g = j.CustomBiomeGenerator as JsonNode;
                biome.generator = {
                    noise: compileField(g.NoiseMask, load, { root: WORLD_ROOT, path: `${path}.CustomBiomeGenerator` }),
                    threshold: intervals(g.NoiseMask.Threshold),
                    parents: g.BiomeMask ? new Set(maskNames(g.BiomeMask as string[], zoneName)) : null,
                    priority: g.Priority ?? 0,
                    fade: biome.fade
                };
            }
            return biome;
        };
        const tiles = r.tiles.map((b) => make(b, false));
        // Custom biomes are tried by priority, highest first; equal priorities keep their file order.
        const customs = r.customs
            .map((b) => make(b, true))
            .sort((a, b) => (b.generator?.priority ?? 0) - (a.generator?.priority ?? 0));
        if (!tiles.length) throw new Error(`Zone ${zoneName} has no tile biomes`);

        const total = tiles.reduce((s, b) => s + b.weight, 0);
        const weighted = (value: number): Biome => {
            if (tiles.length === 1) return tiles[0]!;
            let left = Math.min(value, 0.99999) * total;
            for (const b of tiles) {
                left = left - b.weight;
                if (left <= 9.99999999995449e-6) return b;
            }
            throw new Error('Weighted map found nothing'); // the game returns null here and fails later
        };
        const direct = (seed: number, x: number, z: number) => weighted(random3(seed, bitsOf(x), bitsOf(z)));
        const grid = r.zone.BiomeGenerator.GridGenerator as JsonNode;
        const points: PointGenerator | null =
            tiles.length === 1
                ? null
                : loadPointGenerator(
                      grid,
                      load,
                      { root: WORLD_ROOT, path: `${zonePath}.BiomePatternGenerator` },
                      (seed, cx, cy) => direct(seed, cx, cy).sizeMod
                  );
        if (tiles.length === 1)
            loadPointGenerator(grid, load, { root: WORLD_ROOT, path: `${zonePath}.BiomePatternGenerator` }); // checks the settings are ones we can read

        const uniqueJson = r.zone.UniquePrefabs?.File ? load(r.zone.UniquePrefabs.File) : r.zone.UniquePrefabs;
        const uniquePrefabs: UniquePrefabDef[] = ((uniqueJson?.Entries ?? []) as JsonNode[]).map((e0) => {
            const e = e0.File ? load(e0.File) : e0;
            const cfg = (e.Config?.File ? load(e.Config.File) : e.Config) ?? {};
            if (!cfg.Anchor) throw new Error('Could not find anchor for Unique prefab generator');
            // Only the placement the game uses for a zone with its own spot (the spawn, the temple) is supported.
            if (cfg.Anchor[0] !== 0 || cfg.Anchor[1] !== 0 || cfg.OnWater)
                throw new Error(`Unique prefab ${e.Name}: placement by anchor is not supported yet`);
            const rotations: number[] =
                cfg.Rotations === undefined
                    ? []
                    : ([] as string[]).concat(cfg.Rotations).map((r) => {
                          const q = (
                              { ROTATION_0: 0, ROTATION_90: 1, ROTATION_180: 2, ROTATION_270: 3 } as Record<
                                  string,
                                  number
                              >
                          )[r];
                          if (q === undefined) throw new Error(`Could not find rotation "${r}"`);
                          return q;
                      });
            return {
                name: e.Name ?? 'NO_NAME_GIVEN',
                prefabs: ([] as string[]).concat(e.Prefab ?? []),
                ...(e.Weights ? { weights: e.Weights as number[] } : {}),
                rotations,
                onWater: !!cfg.OnWater,
                isSpawn: !!cfg.IsSpawn,
                showOnMap: !!cfg.ShowOnMap
            };
        });

        zones.set(zoneName, {
            name: zoneName,
            tiles,
            customs,
            uniquePrefabs,
            uniquePath: `${zonePath}.UniquePrefabContainer`,
            caves: src.exists(`Zones/${zoneName}/Cave/Caves.json`)
                ? loadCaveTypes(src.read(`Zones/${zoneName}/Cave/Caves.json`), load, zonePath, (t, p) =>
                      heightThreshold(t, 320, load, p)
                  )
                : [],
            pickBiome(seed, x, z, border) {
                let parent = tiles[0]!;
                if (points) {
                    const p = points.nearest(seed, x, z);
                    parent = weighted(random3(seed, p.ix, p.iy));
                }
                for (const c of customs) {
                    const g = c.generator!;
                    if (g.parents && !g.parents.has(parent.name)) continue;
                    const noise = g.noise(seed, x, z);
                    const hit =
                        border < g.fade.maskSum
                            ? (() => {
                                  const f = fadeFactor(border, g.fade.maskStart, g.fade.maskLength);
                                  return f >= 1e-5 && insideFaded(g.threshold, noise, f);
                              })()
                            : inside(g.threshold, noise);
                    if (hit) return c;
                }
                return parent;
            }
        });
    }

    return {
        zones: [...zones.values()],
        forSeed(seed) {
            seed = Number(BigInt.asIntN(32, BigInt(seed)));
            const mask = climate.forSeed(seed);
            const results = new Map<number, ZoneBiomeResult>();
            const counts = new Map<number, CountList>();
            const heights = new Map<number, number>();
            // exact: two columns never share a key (a hash of the pair collided now and then)
            const keyOf = (x: number, z: number) => x * 33554432 + z;

            const zoneAt = (x: number, z: number): { zone: Zone; border: number } => {
                const [rx, rz] = mask.warp(seed, x, z);
                const { color, fade } = mask.at(seed, rx, rz);
                const names = mapping.get(color & 0xffffff);
                if (!names) throw new Error(`Unknown zone colour mapping for mask: ${color}`);
                if (names.length === 1)
                    return { zone: zones.get(names[0]!)!, border: Number.isNaN(fade) ? Infinity : fade };
                const p = zonePoints.nearest(seed, x, z);
                const index = (hash3Low(seed, p.ix, p.iy) & 0x7fffffff) % names.length;
                return { zone: zones.get(names[index]!)!, border: p.distance };
            };

            // Which biome a column is in, without the height work `zoneBiomeAt` does as well; what the structure search needs.
            const biomes = new Map<number, Biome>();
            const biomeAt = (x: number, z: number): Biome => {
                const k = keyOf(x, z);
                const known = results.get(k)?.biome ?? biomes.get(k);
                if (known) return known;
                const { zone, border } = zoneAt(x, z);
                const biome = zone.pickBiome(seed, x, z, border);
                if (biomes.size > 1000000) biomes.clear();
                biomes.set(k, biome);
                return biome;
            };

            const zoneBiomeAt = (x: number, z: number): ZoneBiomeResult => {
                const k = keyOf(x, z);
                let r = results.get(k);
                if (r) return r;
                const { zone, border } = zoneAt(x, z);
                const biome = zone.pickBiome(seed, x, z, border);
                const context = biome.threshold.context(seed, x, z);
                let noise = biome.heightNoise(seed, x, z);
                if (biome.fade.fadeHeightmap !== FADE_NONE) {
                    const f = fadeFactor(border, biome.fade.terrainStart, biome.fade.terrainLength);
                    noise = noise * (1 - f) + biome.fade.fadeHeightmap * f;
                }
                r = { zone, borderDistance: border, biome, heightThresholdContext: context, heightNoise: noise };
                if (results.size > 400000) results.clear();
                results.set(k, r);
                return r;
            };

            const countsAt = (x: number, z: number): CountList => {
                const k = keyOf(x, z);
                let list = counts.get(k);
                if (list) return list;
                const center = zoneBiomeAt(x, z);
                list = {
                    ids: [center.biome],
                    byBiome: new Map([
                        [
                            center.biome,
                            {
                                biome: center.biome,
                                context: center.heightThresholdContext,
                                noise: center.heightNoise,
                                count: 1
                            }
                        ]
                    ]),
                    center
                };
                const radius = center.biome.interpolation.radius;
                const nN = zoneBiomeAt(x, z - radius);
                const nS = zoneBiomeAt(x, z + radius);
                const nW = zoneBiomeAt(x - radius, z);
                const nE = zoneBiomeAt(x + radius, z);
                if (
                    nN.biome === center.biome &&
                    nS.biome === center.biome &&
                    nW.biome === center.biome &&
                    nE.biome === center.biome
                ) {
                    list = {
                        ids: [center.biome],
                        byBiome: new Map([
                            [
                                center.biome,
                                {
                                    biome: center.biome,
                                    context: center.heightThresholdContext,
                                    noise: center.heightNoise,
                                    count: 1
                                }
                            ]
                        ]),
                        center
                    };
                    if (counts.size > 400000) counts.clear();
                    counts.set(k, list);
                    return list;
                }

                const radius2 = radius * radius;
                for (let ix = -radius; ix <= radius; ix++) {
                    for (let iz = -radius; iz <= radius; iz++) {
                        const d2 = ix * ix + iz * iz;
                        if ((ix === 0 && iz === 0) || d2 > radius2) continue;
                        const n = zoneBiomeAt(x + ix, z + iz);
                        if (center.biome.interpolation.radius2(n.biome.name) < d2) continue;
                        const e = list.byBiome.get(n.biome);
                        if (!e) {
                            list.ids.push(n.biome);
                            list.byBiome.set(n.biome, {
                                biome: n.biome,
                                context: n.heightThresholdContext,
                                noise: n.heightNoise,
                                count: 1
                            });
                        } else {
                            // The game's running average divides by the count before this one: the first neighbour replaces the value.
                            e.noise = e.noise - e.noise / e.count + n.heightNoise / e.count;
                            e.count++;
                        }
                    }
                }
                if (list.ids.length === 1) {
                    const e = list.byBiome.get(center.biome)!;
                    e.noise = center.heightNoise;
                    e.count = 1;
                }
                if (counts.size > 400000) counts.clear();
                counts.set(k, list);
                return list;
            };

            const heightAt = (x: number, z: number): number => {
                const k = keyOf(x, z);
                const cached = heights.get(k);
                if (cached !== undefined) return cached;
                const list = countsAt(x, z);
                let n = 0,
                    counter = 0;
                for (const b of list.ids) {
                    const e = list.byBiome.get(b)!;
                    n += e.noise * e.count;
                    counter += e.count;
                }
                const heightNoise = n / counter;
                let highest = -1;
                for (const b of list.ids)
                    if (b.threshold.highestNonZero > highest) highest = b.threshold.highestNonZero;
                let low = 0,
                    high = highest;
                let h = 0;
                while (low <= high) {
                    const mid = (low + high) >> 1;
                    let threshold = 0;
                    let c = 0;
                    for (const b of list.ids) {
                        const e = list.byBiome.get(b)!;
                        threshold = f32(threshold + f32(b.threshold.at(seed, x, z, mid, e.context) * f32(e.count)));
                        c += e.count;
                    }
                    threshold = f32(threshold / f32(c));
                    if (threshold > heightNoise || threshold === 1) {
                        h = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }
                if (heights.size > 400000) heights.clear();
                heights.set(k, h);
                return h;
            };

            const waterAt = (x: number, z: number): { y: number; fluid: string } | null => {
                const biome = zoneBiomeAt(x, z).biome;
                let top = -Infinity,
                    fluid = '';
                for (const e of biome.water) {
                    if (e.mask && !e.mask(seed, x, z)) continue;
                    if (!e.fluid) continue; // a block entry (ice, cooled magma) is solid, not a surface of liquid
                    const min = Math.floor(e.min(seed, x, z)),
                        max = Math.floor(e.max(seed, x, z));
                    if (min > max || max <= top) continue;
                    top = max;
                    fluid = e.fluid;
                }
                return top > 0 ? { y: top, fluid } : null;
            };

            const tintAt = (x: number, z: number): number => {
                const radius = 4;
                let r = 0,
                    g = 0,
                    b = 0,
                    n = 0;
                for (let ix = -radius; ix <= radius; ix++) {
                    for (let iz = -radius; iz <= radius; iz++) {
                        if (ix * ix + iz * iz > radius * radius) continue;
                        const c = zoneBiomeAt(x + ix, z + iz).biome.tint(seed, x + ix, z + iz);
                        r += (c >> 16) & 0xff;
                        g += (c >> 8) & 0xff;
                        b += c & 0xff;
                        n++;
                    }
                }
                return (0xff000000 | (Math.trunc(r / n) << 16) | (Math.trunc(g / n) << 8) | Math.trunc(b / n)) >>> 0;
            };

            const topAt = (x: number, z: number, surface: number): Top =>
                topOfColumn(zoneBiomeAt(x, z).biome.layers, seed, x, z, surface);

            const coverChunk = (chunkX: number, chunkZ: number, tops: Top[]): Top[] => {
                const random = new FastRandom(hash4(seed, chunkX, chunkZ, 5647422603192711886n));
                const out = tops.slice();
                for (let lx = 0; lx < 32; lx++) {
                    for (let lz = 0; lz < 32; lz++) {
                        const col = (lz << 5) | lx,
                            top = tops[col]!;
                        const x = chunkX * 32 + lx,
                            z = chunkZ * 32 + lz;
                        const biome = zoneBiomeAt(x, z).biome;
                        const placed = new Map<number, { block: string | null; fluid: string | null }>();
                        const below = (y: number, fallback: { block: string | null; fluid: string | null }) => {
                            const p = placed.get(y);
                            if (p) return p;
                            if (y === top.y) return { block: top.block, fluid: null };
                            return y < top.y ? { block: '*', fluid: null } : fallback;
                        };
                        const column = (c: Cover) => random.nextDouble() < c.density && (!c.mask || c.mask(seed, x, z));
                        const place = (c: Cover, y: number) => {
                            const part = pickPart(c, random);
                            placed.set(y + part.offset, { block: part.block, fluid: part.fluid });
                        };
                        const parentOk = (
                            c: Cover,
                            y: number,
                            fallback: { block: string | null; fluid: string | null }
                        ) => {
                            if (y <= 0 || y >= 320) return false;
                            if (!c.parent) return true;
                            const b = below(y - 1, fallback);
                            return c.parent.has(blockKey(b.block, b.fluid));
                        };
                        for (const w of biome.water) {
                            for (const c of biome.covers) {
                                if (!c.onWater || !column(c)) continue;
                                const y = Math.floor(w.max(seed, x, z)) + 1;
                                if (c.height && !c.height(seed, x, z, y, random)) continue;
                                if (!parentOk(c, y, { block: w.block, fluid: w.fluid })) continue;
                                place(c, y);
                            }
                        }
                        const y = top.y + 1;
                        for (const c of biome.covers) {
                            if (c.onWater || !parentOk(c, y, { block: null, fluid: null }) || !column(c)) continue;
                            if (c.height && !c.height(seed, x, z, y, random)) continue;
                            place(c, y);
                        }
                        // The top of the column is the highest thing placed, or what the layers left.
                        let topY = top.y,
                            block = top.block,
                            fluid = top.fluid;
                        for (const [py, p] of placed) {
                            if (p.block && py >= topY) {
                                topY = py;
                                block = p.block;
                            }
                            if (p.fluid && !p.block && py >= (fluid?.y ?? -1)) fluid = { name: p.fluid, y: py };
                        }
                        out[col] = { block, y: topY, fluid };
                    }
                }
                return out;
            };

            // `ChunkGenerator.generateHeightBetween`: the highest height the interpreter allows that is still ground.
            const heightBetween = (
                x: number,
                z: number,
                interpreter: { lowestNonOne: number; highestNonZero: number }
            ): number => {
                const list = countsAt(x, z);
                let n = 0,
                    counter = 0;
                for (const b of list.ids) {
                    const e = list.byBiome.get(b)!;
                    n += e.noise * e.count;
                    counter += e.count;
                }
                const heightNoise = n / counter;
                let highest = -1;
                for (const b of list.ids)
                    if (b.threshold.highestNonZero > highest) highest = b.threshold.highestNonZero;
                for (let y = highest; y > 0; y--) {
                    if (y < interpreter.lowestNonOne || y > interpreter.highestNonZero) continue;
                    let threshold = 0,
                        c = 0;
                    for (const b of list.ids) {
                        const e = list.byBiome.get(b)!;
                        threshold = f32(threshold + f32(b.threshold.at(seed, x, z, y, e.context) * f32(e.count)));
                        c += e.count;
                    }
                    threshold = f32(threshold / f32(c));
                    if (threshold > heightNoise || threshold === 1) return y;
                }
                return 0;
            };

            // `UniquePrefabGenerator.forceUniqueZonePlacement`: from the zone's centre, walk towards where the mask maps back to it.
            // `UniquePrefabContainer.generate`: one random sequence per zone, drawn entry by entry: which variant, then which turn.
            let uniqueMemo: UniquePrefabSpot[] | null = null;
            const uniquePrefabs = (): UniquePrefabSpot[] => {
                if (uniqueMemo) return uniqueMemo;
                const out: UniquePrefabSpot[] = [];
                const zoneNamesWithUniques = [...new Set(mask.uniques.map((u) => u.zone))];
                for (const zoneName of zoneNamesWithUniques) {
                    const zone = zones.get(zoneName);
                    if (!zone?.uniquePrefabs.length) continue;
                    const u = mask.uniques.find((q) => q.zone === zoneName)!;
                    const random = new FastRandom(BigInt((seed + seedOf(zone.uniquePath)) | 0));
                    for (const def of zone.uniquePrefabs) {
                        let x = u.x,
                            z = u.y;
                        for (let i = 0; i < 8; i++) {
                            const [wx, wz] = mask.warp(seed, x, z);
                            x -= Math.trunc((Math.floor(wx) - u.x) / 2);
                            z -= Math.trunc((Math.floor(wz) - u.y) / 2);
                        }
                        const spot: UniquePrefabSpot = { ...def, zone: zoneName, x, y: heightAt(x, z), z };
                        if (catalog) {
                            const variants: {
                                    name: string;
                                    bounds: PrefabBounds;
                                    marks?: { block: string; x: number; y: number; z: number }[];
                                }[] = [],
                                weights: number[] = [];
                            def.prefabs.forEach((key, ki) => {
                                const found = catalog.resolve(key);
                                for (const v of found) {
                                    variants.push(v);
                                    weights.push(def.weights ? def.weights[ki]! / found.length : 1);
                                }
                            });
                            const total = weights.reduce((a, b) => a + b, 0);
                            let left = Math.min(random.nextDouble(), 0.99999) * total,
                                picked = variants[variants.length - 1]!;
                            for (let i = 0; i < variants.length; i++) {
                                left -= weights[i]!;
                                if (left <= 9.99999999995449e-6) {
                                    picked = variants[i]!;
                                    break;
                                }
                            }
                            const turns = def.rotations.length
                                ? def.rotations[random.nextInt(def.rotations.length)]!
                                : 0;
                            spot.variant = picked.name;
                            spot.rotation = turns * 90;
                            spot.footprint = rotatedFootprint(picked.bounds, turns);
                            if (picked.marks?.length)
                                spot.marks = picked.marks.map((m) => {
                                    const [rx, rz] = rotateXZ(m.x, m.z, turns);
                                    return { block: m.block, x: x + rx, y: spot.y + m.y, z: z + rz };
                                });
                        }
                        out.push(spot);
                    }
                }
                // Zones without their own spot would be placed by trying positions around an anchor, which draws random numbers; none in the game's data has prefabs.
                for (const zone of zones.values()) {
                    if (zone.uniquePrefabs.length && !mask.uniques.some((u) => u.zone === zone.name))
                        throw new Error(`Zone ${zone.name} has unique prefabs but no place of its own`);
                }
                return (uniqueMemo = out);
            };

            const allBiomes: Biome[] = [...zones.values()]
                .flatMap((z) => [...z.tiles, ...z.customs])
                .sort((a, b) => a.id - b.id);
            const prefabSites = (
                rect: { minX: number; minZ: number; maxX: number; maxZ: number },
                accept?: (key: string) => boolean,
                coarse = 0
            ): PrefabSite[] => {
                const uniques = uniquePrefabs().map((u) => ({ x: u.x, z: u.z }));
                const siteWorld: SiteWorld = {
                    seed,
                    biomeAt: (x, z) => biomeAt(x, z) as unknown as SiteBiome,
                    heightAt,
                    heightBetween: (x, z, interp) => heightBetween(x, z, interp),
                    topBlock: (b, x, z) => dynamicTopBlock((b as unknown as Biome).layers, seed, x, z),
                    uniques
                };
                return collectSites(siteWorld, allBiomes as unknown as SiteBiome[], rect, accept, coarse);
            };

            const zoneNames = new Map<number, string>();
            const zoneNameOf = (x: number, z: number): string => {
                const k = keyOf(x, z);
                let n = zoneNames.get(k);
                if (n === undefined) {
                    n = (results.get(k)?.zone ?? zoneAt(x, z).zone).name;
                    if (zoneNames.size > 1000000) zoneNames.clear();
                    zoneNames.set(k, n);
                }
                return n;
            };
            const caveEntries = (
                rect: { minX: number; minZ: number; maxX: number; maxZ: number },
                accept?: (name: string) => boolean
            ): CaveEntry[] =>
                collectCaveEntries({ seed, zoneNameAt: zoneNameOf, heightAt }, [...zones.values()], rect, accept);

            const environmentAt = (x: number, z: number): string => biomeAt(x, z).environment(seed, x, z);
            const biomeKeyAt = (x: number, z: number): string => {
                const b = biomeAt(x, z);
                return `${b.zone}/${b.name}`;
            };

            const SQUARE = 512;
            const squares = new Map<string, PrefabSite[]>();
            // Trees, rocks and plants use a wider cell for the biome shortcut: 2.7 times faster, and of 18 077 sites on three squares
            // 12 were missed and 6 added against the cell of 8 (a plant by a biome border); monuments keep the finer cell.
            const DECOR_COARSE = 16;
            const squareSites = (qx: number, qz: number, decor: boolean): PrefabSite[] => {
                const k = `${decor ? 'd' : 'm'}${qx},${qz}`;
                let list = squares.get(k);
                if (!list) {
                    const rect = {
                        minX: qx * SQUARE,
                        minZ: qz * SQUARE,
                        maxX: qx * SQUARE + SQUARE - 1,
                        maxZ: qz * SQUARE + SQUARE - 1
                    };
                    // dense grids, so the biome of a point is taken from a coarse cell and only the biomes seen on the square are searched
                    // (the same sites as the exact search on every square tried, hundreds of times faster; accepted points are checked exactly)
                    list = catalog
                        ? prefabSites(rect, (key) => (decor ? DECOR_PREFABS : MONUMENT_PREFABS).test(key), decor ? DECOR_COARSE : 8)
                        : [];
                    if (squares.size > 400) squares.clear();
                    squares.set(k, list);
                }
                return list;
            };
            const chunkSites = (cx: number, cz: number, decor = false, shared?: SiteShape[]): PrefabSite[] => {
                const x0 = cx * 32,
                    z0 = cz * 32,
                    x1 = x0 + 31,
                    z1 = z0 + 31;
                const out: PrefabSite[] = [];
                for (const spot of uniquePrefabs()) {
                    if (!spot.variant || !spot.footprint) continue;
                    const f = spot.footprint;
                    if (spot.x + f[1] >= x0 && spot.x + f[0] <= x1 && spot.z + f[3] >= z0 && spot.z + f[2] <= z1)
                        out.push({
                            x: spot.x,
                            y: spot.y,
                            z: spot.z,
                            name: spot.variant,
                            rotation: spot.rotation ?? 0,
                            footprint: f
                        } as unknown as PrefabSite);
                }
                for (const kind of decor ? [false, true] : [false]) {
                    const reach = kind ? 64 : 128; // how far a prefab of that kind can stick out of the square its spot is in
                    for (let qz = Math.floor((z0 - reach) / SQUARE); qz <= Math.floor((z1 + reach) / SQUARE); qz++) {
                        for (
                            let qx = Math.floor((x0 - reach) / SQUARE);
                            qx <= Math.floor((x1 + reach) / SQUARE);
                            qx++
                        ) {
                            for (const site of kind && shared ? [] : squareSites(qx, qz, kind)) {
                                const f = site.footprint;
                                if (
                                    site.x + f[1] >= x0 &&
                                    site.x + f[0] <= x1 &&
                                    site.z + f[3] >= z0 &&
                                    site.z + f[2] <= z1
                                )
                                    out.push(site);
                            }
                        }
                    }
                }
                if (decor && shared) {
                    for (const site of shared) {
                        const f = site.footprint;
                        if (site.x + f[1] >= x0 && site.x + f[0] <= x1 && site.z + f[3] >= z0 && site.z + f[2] <= z1)
                            out.push(site as PrefabSite);
                    }
                }
                return out;
            };
            const shape = (list: PrefabSite[]): SiteShape[] =>
                list.map((q) => ({
                    x: q.x,
                    y: q.y,
                    z: q.z,
                    name: q.name,
                    rotation: q.rotation,
                    footprint: q.footprint
                }));

            return {
                zoneBiomeAt,
                heightAt,
                waterAt,
                tintAt,
                environmentAt,
                biomeKeyAt,
                chunkSites,
                squareSites: (qx: number, qz: number, decor: boolean) => shape(squareSites(qx, qz, decor)),
                topAt,
                coverChunk,
                uniques: mask.uniques,
                uniquePrefabs,
                prefabSites,
                caveEntries
            };
        }
    };
}
