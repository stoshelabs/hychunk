import { search, blank, collectPoints, type CellOptions } from './cell';
import { cellOptions, randomizer, seedOf, type JsonNode, type Loader } from './graph';

// The grid generators of Zones.json and of each zone's biome pattern: jittered cells, the nearest
// point wins. Written from the game's `PointGeneratorJsonLoader` and the point generators it builds.

export interface PointResult {
    ix: number;
    iy: number;
    /** Distance to the nearest point, in the units of the input. */
    distance: number;
}

export interface PointGenerator {
    nearest(seed: number, x: number, y: number): PointResult;
    /** Every point inside the box, in the game's order (`IPointGenerator.collect`). */
    collect(seed: number, minX: number, minY: number, maxX: number, maxY: number, out: (x: number, y: number) => void): void;
}

interface PointScope { root: string; path: string }

export function loadPointGenerator(json: JsonNode, load: Loader, scope: PointScope, sizeMod?: CellOptions['sizeMod']): PointGenerator {
    for (const key of ['OffsetZ', 'Rotate']) {
        if (json[key] !== undefined) throw new Error(`Point generator option ${key} is not supported yet`);
    }
    const seedOffset = json.Seed !== undefined ? seedOf(scope.root + json.Seed) : seedOf(scope.path);
    const opts = cellOptions(json);
    if (sizeMod) opts.sizeMod = sizeMod;
    const scale: number | undefined = json.Scale;
    // `OffsetPointGenerator`: the lookup is moved by the offset; collected points are moved too, but the box searched is not.
    const offX: number = json.OffsetX ?? json.Offset ?? 0, offY: number = json.OffsetY ?? json.Offset ?? 0;
    const warp = json.Randomizer ? randomizer(json.Randomizer, load, scope) : undefined;
    const found = blank();
    return {
        nearest(seed, x, y) {
            x += offX; y += offY;
            if (warp) {
                const wx = x + warp.x(seed, x, y), wy = y + warp.y(seed, x, y);
                x = wx; y = wy;
            }
            if (scale !== undefined) { x *= scale; y *= scale; }
            search(opts, (seed + seedOffset) | 0, x, y, found, false);
            return { ix: found.ix, iy: found.iy, distance: scale !== undefined ? Math.sqrt(found.distance) / scale : found.distance };
        },
        collect(seed, minX, minY, maxX, maxY, out) {
            if (warp) throw new Error('Collecting points of a warped grid is not supported yet');
            const k = scale ?? 1;
            collectPoints(opts, (seed + seedOffset) | 0, minX * k, minY * k, maxX * k, maxY * k, (x, y) => out(x / k + offX, y / k + offY));
        }
    };
}
