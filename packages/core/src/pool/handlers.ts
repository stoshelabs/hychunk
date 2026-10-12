import { renderChunkPixels } from '../world/render';
import { highlightRegionMask, predictedRegionPixels } from '../world/predict';
import type { MapStyle } from '../world/mapStyle';
import { CorruptChunkError } from '../storage/region';
import type { JobHandlers } from './types';

/** `tile`: a chunk as 32×32 RGBA for the 2D map. `null` when missing; `corrupt` when the slot is damaged. */
export interface TileResult {
    pixels: Uint8ClampedArray | null;
    corrupt: boolean;
    /** The chunk comes from the generator, not the save: trees, rocks and plants can still be added to it (`decor`). */
    predicted?: boolean;
    /** It already has them. */
    decor?: boolean;
}

/** `ground`: the y of the top block of one column, or -1. */
export interface GroundParams {
    x: number;
    z: number;
}

export const coreHandlers: JobHandlers = {
    async tile(ctx, { cx, cz, decor, sites }: { cx: number; cz: number; decor?: boolean; sites?: unknown[] }) {
        try {
            const surface = await ctx.surface(cx, cz, decor, sites);
            if (!surface) return { result: { pixels: null, corrupt: false } satisfies TileResult };
            const terrain = Boolean(ctx.settings.terrain);
            // The heights just past the chunk's edge come from its neighbours, as in the game's map.
            const neighbors = terrain
                ? {
                      n: await ctx.neighbor(cx, cz - 1, decor, sites),
                      s: await ctx.neighbor(cx, cz + 1, decor, sites),
                      w: await ctx.neighbor(cx - 1, cz, decor, sites),
                      e: await ctx.neighbor(cx + 1, cz, decor, sites),
                      nw: await ctx.neighbor(cx - 1, cz - 1, decor, sites),
                      ne: await ctx.neighbor(cx + 1, cz - 1, decor, sites),
                      sw: await ctx.neighbor(cx - 1, cz + 1, decor, sites),
                      se: await ctx.neighbor(cx + 1, cz + 1, decor, sites)
                  }
                : undefined;
            const pixels = renderChunkPixels(surface, undefined, {
                terrain,
                neighbors,
                style: ctx.settings.mapStyle as MapStyle | undefined
            });
            return {
                result: {
                    pixels,
                    corrupt: false,
                    predicted: surface.groundY !== undefined,
                    decor: Boolean(decor)
                } satisfies TileResult,
                transfer: [pixels.buffer]
            };
        } catch (e) {
            if (e instanceof CorruptChunkError) return { result: { pixels: null, corrupt: true } satisfies TileResult };
            throw e;
        }
    },
    /** `predictRegion`: the far-out colours of a whole region from the generator, or `null` without it. */
    async predictRegion(ctx, { rx, rz }: { rx: number; rz: number }) {
        const gen = ctx.terrainGen();
        if (!gen) return { result: null };
        const pixels = predictedRegionPixels(rx, rz, gen);
        return { result: pixels, transfer: [pixels.buffer] };
    },
    /** `highlightRegion`: which chunks of a region have one of the environments (a mob's spawn area) or one of the biomes. */
    async highlightRegion(
        ctx,
        { rx, rz, envs, biomes }: { rx: number; rz: number; envs?: string[]; biomes?: string[] }
    ) {
        const gen = ctx.terrainGen();
        if (!gen) return { result: null };
        const pixels = highlightRegionMask(rx, rz, gen, {
            envs: envs ? new Set(envs) : undefined,
            biomes: biomes ? new Set(biomes) : undefined
        });
        return { result: pixels, transfer: [pixels.buffer] };
    },
    /** `decorSquare`: the sites of trees, rocks and plants of a 512-block square, worked out once here for every tile that needs them. */
    async decorSquare(ctx, { qx, qz }: { qx: number; qz: number }) {
        const gen = ctx.terrainGen();
        return { result: gen?.squareSites ? gen.squareSites(qx, qz, true) : null };
    },
    async ground(ctx, { x, z }: GroundParams) {
        const bx = Math.floor(x),
            bz = Math.floor(z);
        const s = await ctx.surface(Math.floor(bx / 32), Math.floor(bz / 32));
        return { result: s?.blockY[((bz & 31) << 5) | (bx & 31)] ?? -1 };
    }
};
