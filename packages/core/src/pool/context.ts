import { RegionFile } from '../storage/region';
import { REGION_SIZE, slotOf } from '../storage/region';
import { CorruptChunkError } from '../storage/region';
import { readSurface, type ChunkSurface } from '../world/chunk';
import { generatePredictedSurface, predictedEdgeSurface } from '../world/predict';
import type { WorldConfig } from '../world/config';
import { openRegionSource, type RegionSource } from '../world/source';
import type { BsonDocument } from '../bson/reader';
import type { JobContext } from './types';
import { loadWorldGen, makeCatalog, memorySource, type JsonNode } from '@hychunk/worldgen';

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** Reads chunks from a source and caches regions and recent surfaces; one per thread that runs jobs. */
export function createContext(source: RegionSource, surfaceCache = 384): JobContext {
    const regions = new Map<string, Promise<RegionFile>>();
    const surfaces = new Map<string, ChunkSurface | null>();
    const settings: Record<string, unknown> = {};
    /** Edge heights of predicted chunks: each chunk's edges are asked for by the eight tiles around it. */
    const edges = new Map<string, ChunkSurface>();

    let cachedWorldGenFiles: unknown = null;
    let cachedPrefabTable: unknown = null;
    let cachedWorldGen: any = null;
    let cachedSeed: number | null = null;
    let cachedTerrainGen: any = null;

    const getTerrainGen = () => {
        if (settings.worldGen) return settings.worldGen;
        const files = settings.worldGenFiles as Record<string, JsonNode> | undefined;
        if (!files) return undefined; // the generator's data comes from the person's own Assets.zip
        const table = settings.prefabTable as any;
        if (files !== cachedWorldGenFiles || table !== cachedPrefabTable) {
            cachedWorldGenFiles = files;
            cachedPrefabTable = table;
            try {
                cachedWorldGen = loadWorldGen(memorySource(files), table ? makeCatalog(table) : undefined);
            } catch (e) {
                console.warn('[hychunk] Failed to load worldGenFiles in worker context:', e);
                cachedWorldGen = null;
            }
            cachedSeed = null;
            cachedTerrainGen = null;
        }
        if (!cachedWorldGen) return undefined;
        const config = settings.config as WorldConfig | undefined;
        const seed = Number(BigInt.asIntN(32, BigInt(config?.seed ?? 0)));
        if (cachedSeed !== seed || !cachedTerrainGen) {
            cachedSeed = seed;
            try {
                cachedTerrainGen = cachedWorldGen.forSeed(seed);
            } catch (e) {
                console.warn('[hychunk] Failed to create TerrainGen for seed', seed, e);
                cachedTerrainGen = null;
            }
        }
        return cachedTerrainGen ?? undefined;
    };

    const region = (rx: number, rz: number) => {
        const key = `${rx}.${rz}`;
        let p = regions.get(key);
        if (!p) regions.set(key, (p = openRegionSource(source, rx, rz)));
        return p;
    };

    const chunk = async (cx: number, cz: number): Promise<BsonDocument | null> => {
        const rx = floorDiv(cx, REGION_SIZE),
            rz = floorDiv(cz, REGION_SIZE);
        let r: RegionFile;
        try {
            r = await region(rx, rz);
        } catch {
            return null; // no such region file
        }
        const slot = slotOf(cx - rx * REGION_SIZE, cz - rz * REGION_SIZE);
        return r.has(slot) ? r.readChunk(slot) : null;
    };

    return {
        chunk,
        settings,
        terrainGen: getTerrainGen,
        async neighbor(cx, cz, decor = false, shared) {
            const key = `${cx},${cz}`;
            const known = surfaces.get(key);
            if (known) return known;
            const rx = floorDiv(cx, REGION_SIZE),
                rz = floorDiv(cz, REGION_SIZE);
            let saved = false;
            try {
                const r = await region(rx, rz);
                saved = r.has(slotOf(cx - rx * REGION_SIZE, cz - rz * REGION_SIZE));
            } catch {
                /* no such region file */
            }
            if (saved) return this.surface(cx, cz);
            const gen = getTerrainGen();
            const type = (settings.config as WorldConfig | undefined)?.worldGenType ?? 'Hytale';
            if (!gen || type !== 'Hytale') return this.surface(cx, cz);
            const ek = `${cx},${cz},${decor ? 1 : 0}`;
            const hit = edges.get(ek);
            if (hit) return hit;
            const made = predictedEdgeSurface(cx, cz, gen, settings.prefabTops as any, decor, shared as any);
            edges.set(ek, made);
            if (edges.size > 3000) edges.delete(edges.keys().next().value!);
            return made;
        },
        async surface(cx, cz, decor = false, shared) {
            const key = decor ? `${cx},${cz}d` : `${cx},${cz}`;
            if (surfaces.has(key)) {
                const hit = surfaces.get(key)!;
                surfaces.delete(key);
                surfaces.set(key, hit); // most recent last
                return hit;
            }
            let s: ChunkSurface | null = null;
            try {
                const doc = await chunk(cx, cz);
                if (doc) s = readSurface(doc);
            } catch (e) {
                if (!(e instanceof CorruptChunkError)) throw e;
            }
            if (!s) {
                const gen = getTerrainGen();
                s = generatePredictedSurface(
                    cx,
                    cz,
                    settings.config as WorldConfig | undefined,
                    gen,
                    settings.prefabTops as any,
                    decor,
                    shared as any
                );
            }
            surfaces.set(key, s);
            if (surfaces.size > surfaceCache) surfaces.delete(surfaces.keys().next().value!);
            return s;
        }
    };
}
