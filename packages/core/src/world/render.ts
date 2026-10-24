import { blockColor, fluidColor } from './colors';
import type { ChunkSurface } from './chunk';
import { styledBlockColor, styledFluidColor, type MapStyle } from './mapStyle';

/** Bump when the drawing of a chunk changes, so tiles saved by an older version are not reused. */
export const RENDER_VERSION = 11; // 11: prioritize decor squares and prevent timing out into bald chunk tiles; 10: single-pass decor; 9: second pass; 8: structures

// The game's ImageBuilder (the map the client draws): light (-0.2, 0.8, 0.5), shade = 0.4 + 0.6 * lambert.
const LX = -0.2 / Math.sqrt(0.93);
const LY = 0.8 / Math.sqrt(0.93);
const LZ = 0.5 / Math.sqrt(0.93);

const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
];
const quant = (v: number) => Math.min(255, Math.floor((v + 4) / 8) * 8);
const quantDither = (v: number, off: number) =>
    Math.min(255, Math.floor((Math.max(0, Math.min(255, v + off)) + 4) / 8) * 8);

export interface RenderChunkOptions {
    /** Relief shading from the heights, as the game's map does (default: false, flat colours). */
    terrain?: boolean;
    /** The eight neighbouring chunks' surfaces, for the heights just past this chunk's edge; a missing one repeats the edge. */
    neighbors?: {
        n?: ChunkSurface | null;
        s?: ChunkSurface | null;
        w?: ChunkSurface | null;
        e?: ChunkSurface | null;
        nw?: ChunkSurface | null;
        ne?: ChunkSurface | null;
        sw?: ChunkSurface | null;
        se?: ChunkSurface | null;
    };
    /** Reduce to steps of 8 with ordered dithering where colours change, as the game does before sending the image (default: true). */
    quantize?: boolean;
    /** Colours worked out from the game's own files (block tints, water tint) as its map does; without it the built-in colour table is used. */
    style?: MapStyle;
}

/**
 * A chunk seen from above as 32×32 RGBA, drawn the way the game's own world map is:
 * the column's block colour, lit by the surface slope when `terrain` is set, with the fluid
 * blended over it by its depth (`1 / depth` of the ground shows through), then quantized.
 */
export function renderChunkPixels(
    surface: ChunkSurface,
    out = new Uint8ClampedArray(32 * 32 * 4),
    options?: RenderChunkOptions
): Uint8ClampedArray {
    const terrain = options?.terrain ?? false;
    const nb = options?.neighbors;
    // The height one step past this chunk's edge is the neighbour's column on the opposite side (31 when stepping west or
    // north, 0 when stepping east or south); without that neighbour the edge column's own height stands in.
    const getH = (nx: number, nz: number) => {
        const cx = nx < 0 ? 0 : nx > 31 ? 31 : nx;
        const cz = nz < 0 ? 0 : nz > 31 ? 31 : nz;
        const own = (surface.groundY ?? surface.blockY)[(cz << 5) | cx]!;
        if (nx >= 0 && nx <= 31 && nz >= 0 && nz <= 31) return own;
        const wx = nx < 0 ? 0 : nx > 31 ? 2 : 1,
            wz = nz < 0 ? 0 : nz > 31 ? 2 : 1;
        const other = !nb
            ? null
            : [
                  [nb.nw, nb.n, nb.ne],
                  [nb.w, null, nb.e],
                  [nb.sw, nb.s, nb.se]
              ][wz]![wx];
        if (!other) return own;
        const ox = nx < 0 ? 31 : nx > 31 ? 0 : nx,
            oz = nz < 0 ? 31 : nz > 31 ? 0 : nz;
        return (other.groundY ?? other.blockY)[(oz << 5) | ox]!;
    };
    const raw = new Int32Array(1024); // packed 0xRRGGBB, or -1 for no block
    for (let z = 0; z < 32; z++) {
        for (let x = 0; x < 32; x++) {
            const col = (z << 5) | x;
            const y = surface.blockY[col]!;
            const name = surface.block[col]!;
            if (y < 0 || !name || name === 'Empty') {
                raw[col] = -1;
                continue;
            }
            let c =
                options?.style && surface.tint
                    ? styledBlockColor(options.style, name, surface.tint ? surface.tint[col]! : 0xffffff)
                    : -1;
            if (c < 0) c = blockColor(name);
            let r = (c >> 16) & 255,
                g = (c >> 8) & 255,
                b = c & 255;

            if (terrain) {
                const w = getH(x - 1, z),
                    e = getH(x + 1, z),
                    n = getH(x, z - 1),
                    s = getH(x, z + 1);
                const nw = getH(x - 1, z - 1),
                    ne = getH(x + 1, z - 1),
                    sw = getH(x - 1, z + 1),
                    se = getH(x + 1, z + 1);
                // u = v = 0.5 for one pixel per block: the game's four-way slope estimate reduces to this
                const dx = e - w + 0.5 * (se - nw);
                const dz = s - n + 0.5 * (sw - ne);
                const inv = 1 / Math.sqrt(dx * dx + 9 + dz * dz);
                const lambert = Math.max(0, dx * inv * LX + 3 * inv * LY + dz * inv * LZ);
                const shade = 0.4 + 0.6 * lambert;
                r = Math.trunc(Math.min(255, Math.max(0, r * shade)));
                g = Math.trunc(Math.min(255, Math.max(0, g * shade)));
                b = Math.trunc(Math.min(255, Math.max(0, b * shade)));
            }

            const fluid = surface.fluid[col];
            if (fluid && y < 320) {
                let fc =
                    options?.style && surface.env
                        ? styledFluidColor(options.style, fluid, surface.env?.[col] ?? null)
                        : -1;
                if (fc < 0) fc = fluidColor(fluid);
                const fr = (fc >> 16) & 255,
                    fg = (fc >> 8) & 255,
                    fb = fc & 255;
                const depth = Math.max(1, surface.fluidY[col]! - y + 1); // from the ground block's top to the fluid's surface
                const k = Math.min(1, 1 / depth);
                r = Math.trunc(fr + (r - fr) * k);
                g = Math.trunc(fg + (g - fg) * k);
                b = Math.trunc(fb + (b - fb) * k);
            }
            raw[col] = (r << 16) | (g << 8) | b;
        }
    }

    const quantize = options?.quantize ?? true;
    for (let z = 0; z < 32; z++) {
        for (let x = 0; x < 32; x++) {
            const col = (z << 5) | x;
            const o = col * 4;
            const c = raw[col]!;
            if (c < 0) {
                out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
                continue;
            }
            let r = (c >> 16) & 255,
                g = (c >> 8) & 255,
                b = c & 255;
            if (quantize) {
                const q = (r2: number, g2: number, b2: number) => (quant(r2) << 16) | (quant(g2) << 8) | quant(b2);
                const here = q(r, g, b);
                let transition = false;
                for (let dz = -2; dz <= 2 && !transition; dz++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        if (!dx && !dz) continue;
                        const nx = x + dx,
                            nz = z + dz;
                        if (nx < 0 || nx > 31 || nz < 0 || nz > 31) continue;
                        const nc = raw[(nz << 5) | nx]!; // a transparent neighbour packs as 0, like the game's zero pixel
                        const other = nc < 0 ? 0 : q((nc >> 16) & 255, (nc >> 8) & 255, nc & 255);
                        if (other !== here) {
                            transition = true;
                            break;
                        }
                    }
                }
                if (transition) {
                    const off = Math.trunc(((BAYER[z & 3]![x & 3]! - 8) * 8) / 16);
                    r = quantDither(r, off);
                    g = quantDither(g, off);
                    b = quantDither(b, off);
                } else {
                    r = quant(r);
                    g = quant(g);
                    b = quant(b);
                }
            }
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = 255;
        }
    }
    return out;
}
