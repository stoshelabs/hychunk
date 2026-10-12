import { WORLD_ROOT, type JsonNode, type Loader } from '../noise/graph';
import { loadPointGenerator, type PointGenerator } from '../noise/points';
import { random4 } from '../noise/hash';
import { maskOf } from './layers';

// Where the caves of each zone begin (`CaveType`, `CavePopulator`): the entry points of each type and the checks the game makes on
// them. What happens below the entry (the nodes, shapes and the prefabs set in them) is not followed.

export interface ThresholdLike {
    context(seed: number, x: number, z: number): number;
    at(seed: number, x: number, z: number, y: number, context: number): number;
}

export interface CaveType {
    name: string;
    /** The entry node's name, as the file gives it (`Mountain_GoblinLair.Entry`). */
    entry: string;
    grid: PointGenerator;
    gridKey: string;
    /** `NoiseMask`: whether a point may start a cave. */
    mask: ReturnType<typeof maskOf>;
    /** `HeightThreshold`: a probability by the height of the ground at the point. */
    height: ThresholdLike | null;
    maxSize: number;
}

/** `CaveTypesJsonLoader`: `Types` of a zone's `Cave/Caves.json`, each possibly a `File`. */
export function loadCaveTypes(json: JsonNode | undefined, load: Loader, zonePath: string, threshold: (j: JsonNode, path: string) => ThresholdLike): CaveType[] {
    if (!json || !Array.isArray(json.Types)) return [];
    const expand = (n: any): any => (n && n.File ? expand(load(n.File)) : n);
    return (json.Types as any[]).map((raw) => {
        const t = expand(raw);
        if (typeof t.Name !== 'string') throw new Error("CaveType is missing the 'Name' property");
        const path = `${zonePath}.CaveGenerator-${t.Name}.CaveType`;
        if (!t.EntryPoints) throw new Error('"EntryPoints" is not defined, no spawn information for caves available');
        const points = expand(t.EntryPoints);
        const grid = loadPointGenerator(points, load, { root: WORLD_ROOT, path });
        return {
            name: t.Name,
            entry: typeof t.Entry === 'string' ? t.Entry : '(inline)',
            grid,
            gridKey: JSON.stringify(points) + (points.Seed === undefined ? path : ''),
            mask: maskOf(expand(t.NoiseMask), load, path),
            height: t.HeightThreshold ? threshold(expand(t.HeightThreshold), path) : null,
            maxSize: t.MaximumSize ?? 0
        };
    });
}

export interface CaveEntry {
    type: string;
    entry: string;
    zone: string;
    x: number;
    y: number;
    z: number;
}

export interface CaveWorld {
    seed: number;
    zoneNameAt(x: number, z: number): string;
    heightAt(x: number, z: number): number;
}

/** `CavePopulator.run` for every entry point of every cave type whose point lies in the box. */
export function collectCaveEntries(world: CaveWorld, zones: { name: string; caves: CaveType[] }[], rect: { minX: number; minZ: number; maxX: number; maxZ: number }, accept?: (name: string) => boolean): CaveEntry[] {
    const { seed } = world;
    const out: CaveEntry[] = [];
    const found = new Map<string, [number, number][]>();
    for (const zone of zones) {
        for (const type of zone.caves) {
            if (accept && !accept(type.name)) continue;
            let points = found.get(type.gridKey);
            if (!points) {
                points = [];
                type.grid.collect(seed, rect.minX, rect.minZ, rect.maxX, rect.maxZ, (px, pz) => { points!.push([px, pz]); });
                found.set(type.gridKey, points);
            }
            for (const [px, pz] of points) {
                const x = Math.floor(px), z = Math.floor(pz);
                if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) continue;
                if (world.zoneNameAt(x, z) !== zone.name) continue;
                if (type.mask && !type.mask(seed, x, z)) continue;
                const y = world.heightAt(x, z);
                if (type.height) {
                    const s = seed + -173220171 | 0;
                    const th = type.height.at(s, x, z, y, type.height.context(s, x, z));
                    if (!(th >= random4(s, x, y, z))) continue;
                }
                out.push({ type: type.name, entry: type.entry, zone: zone.name, x, y, z });
            }
        }
    }
    return out;
}
