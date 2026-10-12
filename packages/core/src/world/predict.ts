import type { ChunkSurface } from './chunk';
import type { WorldConfig } from './config';

/** The top of every column of the structures that are drawn (`PrefabTops` of `@hychunk/worldgen`). */
export interface StructureTops {
    names: string[];
    index: Record<string, [number, number]>;
    data: Int16Array;
}

export interface SiteLike {
    x: number;
    y: number;
    z: number;
    name: string;
    rotation: number;
}

export interface TerrainGenLike {
    /** The structures whose footprint reaches the chunk. */
    chunkSites?(cx: number, cz: number, decor?: boolean, shared?: SiteLike[]): SiteLike[];
    /** The sites of a 512-block square, for sharing between threads. */
    squareSites?(qx: number, qz: number, decor: boolean): SiteLike[];
    heightAt(x: number, z: number): number;
    waterAt(x: number, z: number): { y: number; fluid: string } | null;
    /** The biome tint of a column (0xAARRGGBB), already blended across neighbours. */
    tintAt?(x: number, z: number): number;
    /** The environment name of a column (`Env_Zone1_Plains`), which the spawn tables are keyed by. */
    environmentAt?(x: number, z: number): string;
    /** `Zone/Name` of the biome of a column. */
    biomeKeyAt?(x: number, z: number): string;
    /** The block on top of a column whose ground reaches `surface` (the biome's layers), the surface after them, and any fluid they put there. */
    coverChunk?(
        chunkX: number,
        chunkZ: number,
        tops: Array<{ block: string; y: number; fluid: { name: string; y: number } | null }>
    ): Array<{ block: string; y: number; fluid: { name: string; y: number } | null }>;
    topAt?(
        x: number,
        z: number,
        surface: number
    ): { block: string; y: number; fluid: { name: string; y: number } | null };
    zoneBiomeAt(
        x: number,
        z: number
    ): {
        biome: { mapColor: number; name: string; json?: { Environment?: { Default?: { Names?: string[] } } } };
        zone?: { name: string };
    };
    uniques?: Array<{ zone: string; x: number; y: number; radius: number; color?: number }>;
}

/** Generates a predicted ChunkSurface for an unaccessed / unexplored chunk. */
export function generatePredictedSurface(
    cx: number,
    cz: number,
    config?: WorldConfig,
    gen?: TerrainGenLike,
    structures?: StructureTops,
    decor = false,
    shared?: SiteLike[]
): ChunkSurface {
    const block = new Array<string>(1024);
    const blockY = new Int16Array(1024);
    const fluid = new Array<string | null>(1024);
    const fluidY = new Int16Array(1024);
    const env = new Array<string | null>(1024).fill(null);

    const type = config?.worldGenType ?? 'Hytale';
    if (type === 'Void') {
        block.fill('Empty');
        blockY.fill(-1);
        fluid.fill(null);
        fluidY.fill(-1);
        return { block, blockY, fluid, fluidY };
    }

    if (type === 'Flat') {
        block.fill('Soil_Grass');
        blockY.fill(64);
        fluid.fill(null);
        fluidY.fill(-1);
        return { block, blockY, fluid, fluidY };
    }

    if (gen) {
        // Pass 0: 9x9 grid of heights and biomes (step 4 blocks) for continuous rivers, natural relief, and micro-accurate borders
        const zbGrid = new Array<any>(81);
        const heightGrid = new Int16Array(81);
        const tops: Array<{ block: string; y: number; fluid: { name: string; y: number } | null }> = [];
        const envs = new Array<string | null>(1024).fill(null);
        const tintGrid = gen.tintAt ? new Int32Array(81) : null;
        const tint = tintGrid ? new Int32Array(1024) : undefined;
        for (let gz = 0; gz <= 8; gz++) {
            const wz = cz * 32 + (gz === 8 ? 31 : gz * 4);
            const row = gz * 9;
            for (let gx = 0; gx <= 8; gx++) {
                const wx = cx * 32 + (gx === 8 ? 31 : gx * 4);
                zbGrid[row + gx] = gen.zoneBiomeAt(wx, wz);
                heightGrid[row + gx] = gen.heightAt(wx, wz);
                if (tintGrid) tintGrid[row + gx] = gen.tintAt!(wx, wz) & 0xffffff;
            }
        }

        // Pass 1: Base terrain ground, authentic rivers, lakes, oceans, and canonical Hytale blocks
        for (let lz = 0; lz < 32; lz++) {
            const gz = Math.min(7, lz >> 2);
            const fz = (lz - (gz << 2)) * 0.25;
            const row0 = gz * 9;
            const row1 = (gz + 1) * 9;

            for (let lx = 0; lx < 32; lx++) {
                const col = (lz << 5) | lx;
                const x = cx * 32 + lx;
                const z = cz * 32 + lz;

                const gx = Math.min(7, lx >> 2);
                const fx = (lx - (gx << 2)) * 0.25;

                const h00 = heightGrid[row0 + gx]!;
                const h10 = heightGrid[row0 + gx + 1]!;
                const h01 = heightGrid[row1 + gx]!;
                const h11 = heightGrid[row1 + gx + 1]!;
                const h0 = h00 + (h10 - h00) * fx;
                const h1 = h01 + (h11 - h01) * fx;
                let h = Math.round(h0 + (h1 - h0) * fz);

                if (tint && tintGrid) {
                    // The game blurs the tint over a disc of 4 blocks, so it changes smoothly: interpolate between the grid points.
                    const mix = (shift: number) => {
                        const a = (tintGrid[row0 + gx]! >> shift) & 255,
                            b = (tintGrid[row0 + gx + 1]! >> shift) & 255;
                        const c = (tintGrid[row1 + gx]! >> shift) & 255,
                            d = (tintGrid[row1 + gx + 1]! >> shift) & 255;
                        const t0 = a + (b - a) * fx,
                            t1 = c + (d - c) * fx;
                        return Math.trunc(t0 + (t1 - t0) * fz);
                    };
                    tint[col] = (mix(16) << 16) | (mix(8) << 8) | mix(0);
                }
                if (gen.topAt) {
                    // Exact heights: the covers draw random numbers column by column, so they only keep the game's pattern if every column is right.
                    tops[col] = gen.topAt(x, z, gen.heightAt(x, z));
                    envs[col] =
                        zbGrid[(fz < 0.5 ? gz : gz + 1) * 9 + (fx < 0.5 ? gx : gx + 1)]?.biome?.json?.Environment
                            ?.Default?.Names?.[0] ?? null; // for the water tint
                    continue;
                }
                const sampleIdx = (fz < 0.5 ? gz : gz + 1) * 9 + (fx < 0.5 ? gx : gx + 1);
                const zb = zbGrid[sampleIdx]!;
                const biomeName = (zb.biome?.name ?? '').toLowerCase();
                const zoneName = (zb.zone?.name ?? '').toLowerCase();

                const isRiver = biomeName.includes('river');
                const isOcean = zoneName.includes('ocean') || biomeName.includes('ocean');
                const isLake = biomeName.includes('lake');
                const hasWater = isRiver || isOcean || isLake || h < 114;

                if (hasWater) {
                    fluid[col] =
                        zoneName.includes('zone4') || biomeName.includes('lava') ? 'Lava_Source' : 'Water_Source';
                    fluidY[col] = 114;
                    env[col] = zb.biome?.json?.Environment?.Default?.Names?.[0] ?? null; // for the water tint
                    h = Math.min(h, 109);
                    blockY[col] = h;
                    if (isOcean) {
                        block[col] = 'Soil_Sand';
                    } else if (isRiver) {
                        block[col] = (x ^ z) & 1 ? 'Soil_Gravel' : 'Soil_Dirt';
                    } else {
                        block[col] = 'Soil_Dirt';
                    }
                } else {
                    fluid[col] = null;
                    fluidY[col] = -1;
                    h = Math.max(115, h);
                    blockY[col] = h;

                    if (zoneName.includes('zone2') || biomeName.includes('desert') || biomeName.includes('savannah')) {
                        if (biomeName.includes('savannah')) {
                            block[col] = 'Soil_Grass';
                        } else {
                            block[col] = (x + z) & 1 ? 'Soil_Sand' : 'Soil_Sand_Red';
                        }
                    } else if (
                        zoneName.includes('zone3') ||
                        biomeName.includes('snow') ||
                        biomeName.includes('tundra')
                    ) {
                        block[col] = 'Soil_Snow';
                    } else if (
                        zoneName.includes('zone4') ||
                        biomeName.includes('volcanic') ||
                        biomeName.includes('ash')
                    ) {
                        block[col] = 'Rock_Basalt';
                    } else {
                        // Zone 1: Emerald Grove (canonical Hytale blocks matching loaded saves!)
                        if (biomeName.includes('beach') || (h <= 116 && (isOcean || isLake))) {
                            block[col] = 'Soil_Sand';
                        } else if (h >= 148) {
                            block[col] = 'Rock_Stone';
                        } else if (biomeName.includes('gorge')) {
                            block[col] = ((x + z) & 3) === 0 ? 'Rock_Marble' : 'Soil_Grass_Full';
                        } else {
                            block[col] = 'Soil_Grass_Full';
                        }
                    }
                }
            }
        }

        const groundY = tops.length ? new Int16Array(1024) : undefined;
        if (tops.length) {
            const done = gen.coverChunk ? gen.coverChunk(cx, cz, tops) : tops;
            for (let col = 0; col < 1024; col++) {
                const top = done[col]!;
                const water = gen.waterAt(cx * 32 + (col & 31), cz * 32 + (col >> 5));
                block[col] = top.block;
                blockY[col] = top.y;
                groundY![col] = tops[col]!.y;
                const surface =
                    top.fluid && (!water || top.fluid.y > water.y) ? { y: top.fluid.y, fluid: top.fluid.name } : water;
                if (surface && surface.y > tops[col]!.y) {
                    fluid[col] = surface.fluid;
                    fluidY[col] = surface.y;
                    env[col] = envs[col]!;
                } else {
                    fluid[col] = null;
                    fluidY[col] = -1;
                }
            }
            if (structures && gen.chunkSites)
                pasteStructures(
                    cx,
                    cz,
                    gen.chunkSites(cx, cz, decor, shared),
                    structures,
                    block,
                    blockY,
                    groundY!,
                    fluid,
                    fluidY
                );
        }

        return { block, blockY, fluid, fluidY, env, tint, groundY };
    }

    block.fill('Empty');
    blockY.fill(-1);
    fluid.fill(null);
    fluidY.fill(-1);
    return { block, blockY, fluid, fluidY };
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/**
 * The far-out picture of a region the save does not have: one pixel per chunk, 32 × 32 RGBA, from the biome
 * at the middle of each chunk (its `MapColor`), shaded by how high the ground is, with water over it.
 * Far cheaper than predicting the chunks themselves, so a whole screen of regions can be drawn at once.
 */
export function predictedRegionPixels(
    rx: number,
    rz: number,
    gen: TerrainGenLike,
    out = new Uint8ClampedArray(32 * 32 * 4)
): Uint8ClampedArray {
    for (let lz = 0; lz < 32; lz++) {
        for (let lx = 0; lx < 32; lx++) {
            const x = (rx * 32 + lx) * 32 + 16,
                z = (rz * 32 + lz) * 32 + 16;
            const o = (lz * 32 + lx) * 4;
            const biome = gen.zoneBiomeAt(x, z).biome;
            const base = biome.mapColor;
            const h = gen.heightAt(x, z);
            const shade = 0.78 + 0.34 * Math.min(1, Math.max(0, (h - 90) / 110));
            let r = Math.min(255, ((base >> 16) & 255) * shade),
                g = Math.min(255, ((base >> 8) & 255) * shade),
                b = Math.min(255, (base & 255) * shade);
            const water = gen.waterAt(x, z);
            if (water && water.y > h) {
                const depth = Math.min(1, (water.y - h) / 24);
                const lava = water.fluid.startsWith('Lava');
                const wr = lava ? 230 : 40,
                    wg = lava ? 90 : 105,
                    wb = lava ? 25 : 175;
                r = lerp(wr, wr * 0.55, depth) * 0.6 + r * 0.4 * (1 - depth);
                g = lerp(wg, wg * 0.55, depth) * 0.6 + g * 0.4 * (1 - depth);
                b = lerp(wb, wb * 0.65, depth) * 0.6 + b * 0.4 * (1 - depth);
            }
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = 255;
        }
    }
    return out;
}

/**
 * One pixel per chunk of a region: coloured where the environment at the middle of the chunk is one of `envs` (orange: where a
 * mob spawns) or the biome is one of `biomes` (pink: a biome highlighter), clear elsewhere. The map paints it over the terrain.
 */
export function highlightRegionMask(
    rx: number,
    rz: number,
    gen: TerrainGenLike,
    area: { envs?: ReadonlySet<string>; biomes?: ReadonlySet<string> },
    out = new Uint8ClampedArray(32 * 32 * 4)
): Uint8ClampedArray {
    for (let lz = 0; lz < 32; lz++) {
        for (let lx = 0; lx < 32; lx++) {
            const x = (rx * 32 + lx) * 32 + 16,
                z = (rz * 32 + lz) * 32 + 16;
            const o = (lz * 32 + lx) * 4;
            if (area.envs) {
                const env = gen.environmentAt?.(x, z);
                if (env && area.envs.has(env)) {
                    out[o] = 245;
                    out[o + 1] = 165;
                    out[o + 2] = 36;
                    out[o + 3] = 255;
                }
            } else if (area.biomes) {
                const key = gen.biomeKeyAt?.(x, z);
                if (key && area.biomes.has(key)) {
                    out[o] = 236;
                    out[o + 1] = 72;
                    out[o + 2] = 153;
                    out[o + 3] = 255;
                }
            }
        }
    }
    return out;
}

/** Where a mob can spawn: the chunks whose environment is one of `envs`. */
export const spawnRegionMask = (rx: number, rz: number, gen: TerrainGenLike, envs: ReadonlySet<string>) =>
    highlightRegionMask(rx, rz, gen, { envs });

/**
 * Only the ground heights along the edges of a predicted chunk: what a neighbour needs to shade its own edge. Much cheaper than
 * predicting the whole chunk, and exact, since shading goes by the ground without plants (`groundY`).
 */
export function predictedEdgeSurface(
    cx: number,
    cz: number,
    gen: TerrainGenLike,
    structures?: StructureTops,
    decor = false,
    shared?: SiteLike[]
): ChunkSurface {
    const blockY = new Int16Array(1024).fill(-1);
    for (let i = 0; i < 32; i++) {
        for (const [lx, lz] of [
            [i, 0],
            [i, 31],
            [0, i],
            [31, i]
        ] as const) {
            const x = cx * 32 + lx,
                z = cz * 32 + lz;
            const h = gen.heightAt(x, z);
            blockY[(lz << 5) | lx] = gen.topAt ? gen.topAt(x, z, h).y : h;
        }
    }
    // what stands on the edge counts too, or the shading of the chunk next to it shows a seam along the border
    const fluid: (string | null)[] = [],
        fluidY = new Int16Array(1024).fill(-1);
    if (structures && gen.chunkSites)
        pasteStructures(cx, cz, gen.chunkSites(cx, cz, decor, shared), structures, [], blockY, blockY, fluid, fluidY);
    return { block: [], blockY, groundY: blockY, fluid, fluidY };
}

/** `PrefabRotation` on a block offset: 90 turns (x, z) to (z, -x). */
const turn = (x: number, z: number, deg: number): [number, number] =>
    deg === 0 ? [x, z] : deg === 90 ? [z, -x] : deg === 180 ? [-x, -z] : [-z, x];

/**
 * Sets the top of each column a structure covers: what the structure puts highest there, if that is not under the ground. The map
 * draws the highest block of a column, so only the tops of the prefab matter.
 */
function pasteStructures(
    cx: number,
    cz: number,
    sites: SiteLike[],
    tops: StructureTops,
    block: string[],
    blockY: Int16Array,
    groundY: Int16Array,
    fluid: (string | null)[],
    fluidY: Int16Array
) {
    const x0 = cx * 32,
        z0 = cz * 32;
    for (const site of sites) {
        const at = tops.index[site.name];
        if (!at) continue;
        const [from, length] = at;
        for (let i = from; i < from + length; i += 4) {
            const [rx, rz] = turn(tops.data[i]!, tops.data[i + 1]!, site.rotation);
            const lx = site.x + rx - x0,
                lz = site.z + rz - z0;
            if (lx < 0 || lx > 31 || lz < 0 || lz > 31) continue;
            const col = (lz << 5) | lx,
                y = site.y + tops.data[i + 2]!;
            if (y < blockY[col]!) continue;
            block[col] = tops.names[tops.data[i + 3]!]!;
            blockY[col] = y;
            groundY[col] = Math.max(groundY[col]!, y);
            if (fluid[col] && fluidY[col]! <= y) {
                fluid[col] = null;
                fluidY[col] = -1;
            }
        }
    }
}
