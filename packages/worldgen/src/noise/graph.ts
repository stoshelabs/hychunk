import { cellNoise, distanceNoise, type CellMode, type CellOptions, type Distance2Mode, type DistanceMode } from './cell';
import { oldSimplex2 } from './oldsimplex';
import { rotator } from './rotate';
import { simplex2 } from './simplex';

// An interpreter for the noise graphs that describe the world (the JSON files under
// Server/World/Default). Each node is compiled once into a closure `(seed, x, y) => number`.
// Written for this project: it follows what the data means, not how the game is organised.

export type Field = (seed: number, x: number, y: number) => number;
export type JsonNode = Record<string, any>;

/** Reads a data file by its dotted name (`Mask.Continent` is `Mask/Continent.json`). */
/**
 * `minMaxSkipsFirst`: game 0.7.0 fixed the `MIN` and `MAX` fractal modes to run `octaves - 1` extra samples; before, they ran
 * `octaves` (so one more than the octaves said). Set from the game version by `loadWorldGen`.
 */
export type Loader = ((name: string) => JsonNode) & { minMaxSkipsFirst?: boolean };

/** Where a node sits, which is what unnamed noises take their seed from. */
interface Scope {
    /** The prefix every explicit `Seed` is appended to; a randomizer changes it per axis. */
    root: string;
    /** The path of nested names so far. */
    path: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Java's `String.hashCode`. */
export function stringHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
}

/** A name becomes a noise seed by this hash and multiplier. */
export const seedOf = (name: string) => Math.imul(stringHash(name), 114512143);

export const WORLD_ROOT = 'ChunkGenerator';

/**
 * `scope.path` is the name the *parent* hands down; every node adds `.NoiseProperty` to it, and
 * that is what a noise without its own `Seed` is seeded from.
 */
export function compileField(node: JsonNode, load: Loader, handed: Scope = { root: WORLD_ROOT, path: WORLD_ROOT }): Field {
    if (node.File) return compileField(load(node.File), load, handed);
    const scope: Scope = { root: handed.root, path: `${handed.path}.NoiseProperty` };

    let field: Field;
    switch (node.Type as string | undefined) {
        // A plain noise applies its own Scale and Normalize, so it is done here and not again below.
        case undefined: return leaf(node, scope, load);
        case 'SUM': {
            const parts = (node.Noise as JsonNode[]).map((n, i) => compileField(n, load, { ...scope, path: `${scope.path}-#${i}` }));
            const factors: number[] = node.Factors ?? parts.map(() => 1 / parts.length);
            field = (s, x, y) => {
                let v = 0;
                for (let i = 0; i < parts.length; i++) v += parts[i]!(s, x, y) * factors[i]!;
                return clamp01(v);
            };
            break;
        }
        case 'DISTORTED': {
            const inner = compileField(node.Noise, load, scope);
            const warp = randomizer(node.Randomizer, load, scope);
            field = (s, x, y) => inner(s, x + warp.x(s, x, y), y + warp.y(s, x, y));
            break;
        }
        case 'BLEND': {
            const alpha = compileField(node.Alpha, load, scope);
            const noises = (node.Noise as JsonNode[]).map((n) => compileField(n, load, scope));
            const at: number[] = node.Thresholds;
            field = (s, x, y) => {
                const a = alpha(s, x, y);
                if (a <= at[0]!) return noises[0]!(s, x, y);
                if (a >= at[at.length - 1]!) return noises[noises.length - 1]!(s, x, y);
                for (let i = 1; i < noises.length; i++) {
                    if (a > at[i]!) continue;
                    const t = (a - at[i - 1]!) / (at[i]! - at[i - 1]!);
                    const lo = noises[i - 1]!(s, x, y), hi = noises[i]!(s, x, y);
                    return lo + t * (hi - lo);
                }
                return 0;
            };
            break;
        }
        case 'MIN':
        case 'MAX':
        case 'MULTIPLY': {
            const parts = (node.Noise as JsonNode[]).map((n, i) => compileField(n, load, { ...scope, path: `${scope.path}-#${i}` }));
            if (node.Type === 'MULTIPLY') {
                field = (s, x, y) => {
                    let v = parts[0]!(s, x, y);
                    for (let i = 1; i < parts.length; i++) v *= parts[i]!(s, x, y);
                    return v;
                };
            } else if (node.Type === 'MIN') {
                // Stops as soon as the running value is (nearly) zero, so later parts are not evaluated.
                field = (s, x, y) => {
                    let v = parts[0]!(s, x, y);
                    for (let i = 1; i < parts.length; i++) {
                        if (v < 1e-5) return 0;
                        const d = parts[i]!(s, x, y);
                        if (v > d) v = d;
                    }
                    return v;
                };
            } else {
                field = (s, x, y) => {
                    let v = parts[0]!(s, x, y);
                    for (let i = 1; i < parts.length; i++) {
                        if (v > 0.999999) return 1;
                        const d = parts[i]!(s, x, y);
                        if (v < d) v = d;
                    }
                    return v;
                };
            }
            break;
        }
        case 'INVERT': {
            const inner = compileField(node.Noise, load, scope);
            field = (s, x, y) => 1 - inner(s, x, y);
            break;
        }
        default:
            throw new Error(`Noise type ${node.Type} is not supported yet`);
    }
    return modifiers(field, node, load);
}

const FORMULAS: Record<string, (v: number) => number> = {
    NORMAL: (v) => v,
    INVERTED: (v) => 1 - v,
    SQUARED: (v) => v * v,
    INVERTED_SQUARED: (v) => 1 - v * v,
    SQRT: (v) => Math.sqrt(v),
    INVERTED_SQRT: (v) => 1 - Math.sqrt(v),
    RIDGED: (v) => Math.abs(v - 0.5),
    INVERTED_RIDGED: (v) => 1 - Math.abs(v - 0.5),
    RIDGED_SQRT: (v) => Math.sqrt(Math.abs(v - 0.5)),
    INVERTED_RIDGED_SQRT: (v) => 1 - Math.sqrt(Math.abs(v - 0.5)),
    RIDGED_FIX: (v) => Math.abs(v * 2 - 1),
    INVERTED_RIDGED_FIX: (v) => 1 - Math.abs(v * 2 - 1),
    RIDGED_SQRT_FIX: (v) => Math.sqrt(Math.abs(v * 2 - 1)),
    INVERTED_RIDGED_SQRT_FIX: (v) => 1 - Math.sqrt(Math.abs(v * 2 - 1)),
    RIDGED_SQUARED_FIX: (v) => { const a = Math.abs(v * 2 - 1); return a * a; },
    INVERTED_RIDGED_SQUARED_FIX: (v) => { const a = Math.abs(v * 2 - 1); return 1 - a * a; }
};

/** A range in the data: a number, `[a]`, `[a, b]` or `{Min, Max}`; a one-value range has no width. */
function range(r: unknown): [number, number] {
    if (typeof r === 'number') return [r, r];
    if (Array.isArray(r)) return r.length === 1 ? [r[0], r[0]] : [r[0], r[1]];
    const o = r as { Min: number; Max: number };
    return [o.Min, o.Max];
}

/** `Formula`, `Scale`, `Normalize`, then `Offset`, in the order the game applies them. */
function modifiers(field: Field, node: JsonNode, _load: Loader): Field {
    let f = field;
    if (node.Formula !== undefined && node.Type !== 'FORMULA') {
        const formula = FORMULAS[node.Formula as string];
        if (!formula) throw new Error(`Noise formula ${node.Formula} is not supported yet`);
        if (node.Formula !== 'NORMAL') {
            const inner = f;
            f = (s, x, y) => formula(inner(s, x, y));
        }
    }
    if (node.Curve !== undefined && node.Type !== 'CURVE') {
        // 1 - (1 - v) ^ (a + b (1 - v)), with a clamped to [0, 10] and b to [-a, 10].
        const ca = Math.min(10, Math.max(0, node.Curve.A ?? 2));
        const cb = Math.min(10, Math.max(-ca, node.Curve.B ?? -2));
        const inner = f;
        f = (s, x, y) => {
            const o = 1 - inner(s, x, y);
            return 1 - Math.pow(o, ca + cb * o);
        };
    }
    for (const key of ['Rotate']) {
        if (node[key] !== undefined) throw new Error(`Noise option ${key} is not supported yet`);
    }
    if (node.Scale !== undefined) {
        let kx = 1, ky = 1;
        if (typeof node.Scale === 'number') {
            kx = ky = node.Scale;
        } else if (Array.isArray(node.Scale)) {
            kx = Number(node.Scale[0] ?? 1);
            ky = Number(node.Scale[1] ?? kx);
        } else if (typeof node.Scale === 'object' && node.Scale !== null) {
            kx = Number(node.Scale.X ?? node.Scale.x ?? 1);
            ky = Number(node.Scale.Y ?? node.Scale.y ?? kx);
        }
        const inner = f;
        f = (s, x, y) => inner(s, x * kx, y * ky);
    }
    if (node.Normalize !== undefined) {
        const [lo, hi] = range(node.Normalize), width = hi - lo, inner = f;
        f = (s, x, y) => clamp01((inner(s, x, y) - lo) / width);
    }
    f = offset(f, node);
    // The rotation is the outermost step: the point is turned before anything else is done to it.
    if (node.Pitch !== undefined || node.Yaw !== undefined) {
        const r = rotator(node.Pitch ?? 0, node.Yaw ?? 0, [node.OriginX ?? 0, node.OriginY ?? 0, node.OriginZ ?? 0]);
        if (r) {
            const inner = f;
            f = (s, x, y) => inner(s, r.x(x, y), r.y(x, y));
        }
    }
    // `Gradient` is the very last step: how fast the value changes, looking `Distance` east and south.
    if (node.Gradient !== undefined && node.Type !== 'GRADIENT') {
        const g = node.Gradient as JsonNode;
        const mode = g.Mode ?? 'MAGNITUDE';
        if (mode !== 'MAGNITUDE') throw new Error(`Gradient mode ${mode} is not supported yet`);
        const distance: number = g.Distance ?? 5, inv = 1 / distance / (g.Normalize ?? 0.1), inner = f;
        f = (s, x, y) => {
            const v = inner(s, x, y), dx = inner(s, x + distance, y) - v, dy = inner(s, x, y + distance) - v;
            return clamp01(Math.sqrt(dx * dx + dy * dy) * inv);
        };
    }
    return f;
}

/** `Offset` moves the point looked up, and wraps everything else, so it happens before the scale. */
function offset(f: Field, node: JsonNode): Field {
    if (node.Offset === undefined && node.OffsetX === undefined && node.OffsetY === undefined) return f;
    const ox: number = node.OffsetX ?? node.Offset ?? 0, oy: number = node.OffsetY ?? node.Offset ?? 0;
    return (s, x, y) => f(s, x + ox, y + oy);
}

/** A node that is a noise function itself (simplex, constant, a point) with its fractal settings. */
function leaf(node: JsonNode, scope: Scope, load: Loader): Field {
    const own = node.Seed !== undefined ? seedOf(scope.root + node.Seed) : seedOf(scope.path);
    const fn = primitive(node, scope, load);
    let f: Field;
    if (node.Octaves !== undefined) {
        const octaves: number = node.Octaves, lac: number = node.Lacunarity ?? 2, pers: number = node.Persistence ?? 0.5;
        f = fractal((node.FractalMode as string | undefined) ?? 'FBM', fn, own, octaves, lac, pers, load.minMaxSkipsFirst === true);
    } else {
        f = (s, x, y) => clamp01(fn(s, (s + own) | 0, x, y) * 0.5 + 0.5);
    }
    return modifiers(f, node, () => ({}));
}

function fractal(mode: string, fn: Primitive, own: number, octaves: number, lac: number, pers: number, minMaxSkipsFirst = false): Field {
    switch (mode) {
        case 'FBM':
            return (s, x, y) => {
                let off = (s + own) | 0;
                let sum = fn(s, off, x, y), amp = 1;
                for (let i = 1; i < octaves; i++) {
                    x *= lac;
                    y *= lac;
                    amp *= pers;
                    sum += fn(s, ++off | 0, x, y) * amp;
                }
                return clamp01(sum * 0.5 + 0.5);
            };
        case 'BILLOW':
            return (s, x, y) => {
                let off = (s + own) | 0;
                let sum = Math.abs(fn(s, off, x, y)) * 2 - 1, amp = 1;
                for (let i = 1; i < octaves; i++) {
                    x *= lac;
                    y *= lac;
                    amp *= pers;
                    sum += (Math.abs(fn(s, ++off | 0, x, y)) * 2 - 1) * amp;
                }
                return clamp01(sum * 0.5 + 0.5);
            };
        case 'MULTI_RIGID':
            return (s, x, y) => {
                let off = (s + own) | 0;
                let sum = 1 - Math.abs(fn(s, off, x, y)), amp = 1;
                for (let i = 1; i < octaves; i++) {
                    x *= lac;
                    y *= lac;
                    amp *= pers;
                    sum -= (1 - Math.abs(fn(s, ++off | 0, x, y))) * amp;
                }
                return clamp01(sum * 0.5 + 0.5);
            };
        case 'OLDSCHOOL':
            // Not clamped, and the sum is divided by the total amplitude; frequency doubles each octave.
            return (s, x, y) => {
                let off = (s + own) | 0;
                let maxAmp = 0, amp = 1, freq = 1, sum = 0;
                for (let i = 0; i < octaves; i++) {
                    sum += fn(s - 1, off++ | 0, x * freq, y * freq) * amp;
                    maxAmp += amp;
                    amp *= pers;
                    freq = (freq << 1) | 0;
                }
                sum /= maxAmp;
                return sum * 0.5 + 0.5;
            };
        case 'MIN':
        case 'MAX': {
            // Up to game 0.6 the loop runs `octaves` times after the first sample, so there are octaves + 1 samples; 0.7.0 starts it at 1.
            const min = mode === 'MIN';
            return (s, x, y) => {
                let off = (s + own) | 0;
                let best = fn(s, off, x, y);
                for (let i = minMaxSkipsFirst ? 1 : 0; i < octaves; i++) {
                    x *= lac;
                    y *= lac;
                    const d = fn(s, ++off | 0, x, y);
                    if (min ? d < best : d > best) best = d;
                }
                return clamp01(best * 0.5 + 0.5);
            };
        }
        default:
            throw new Error(`Fractal mode ${mode} is not supported yet`);
    }
}

type Primitive = (seed: number, offsetSeed: number, x: number, y: number) => number;

function primitive(node: JsonNode, scope: Scope, load: Loader): Primitive {
    switch (node.NoiseType as string) {
        case 'SIMPLEX': return simplex2;
        case 'OLD_SIMPLEX': return oldSimplex2;
        case 'CELL': {
            const lookup = node.NoiseLookup
                ? compileField(node.NoiseLookup, load, { root: scope.root, path: `${scope.path}.NoiseFunction.CellNoise` })
                : undefined;
            return cellNoise(cellOptions(node), (node.CellMode as CellMode | undefined) ?? 'CELL_VALUE', lookup);
        }
        case 'DISTANCE':
            return distanceNoise(cellOptions(node), (node.Distance2Mode as Distance2Mode | undefined) ?? 'SUB');
        case 'CONSTANT': { const v: number = node.Value ?? 0.5; return () => v; }
        case 'POINT': {
            const cx: number = node.X ?? 0, cy: number = node.Y ?? 0;
            const inner2 = (node.InnerRadius ?? 0) ** 2, outer2 = (node.OuterRadius ?? 0) ** 2;
            const inv = outer2 - inner2 === 0 ? 1 : 1 / (outer2 - inner2);
            return (_s, _o, x, y) => {
                const d2 = (x - cx) ** 2 + (y - cy) ** 2;
                return d2 <= inner2 ? -1 : d2 >= outer2 ? 1 : -1 + 2 * (d2 - inner2) * inv;
            };
        }
        case 'GRID': {
            // Lines of a lattice: 0 on a line, rising to 1 between, over a band `Thickness` wide on each axis.
            const t = node.Thickness as number | undefined;
            const tx: number = node.ThicknessX ?? t, ty: number = node.ThicknessY ?? t;
            if (tx === undefined || ty === undefined) throw new Error('GRID noise needs Thickness, or ThicknessX and ThicknessY');
            return (_s, _o, x, y) => {
                x -= Math.floor(x);
                y -= Math.floor(y);
                let d = 1;
                if (x < tx) d = x / tx;
                else if (x > 1 - tx) d = (1 - x) / tx;
                if (y < ty) { const u = y / ty; if (u < d) d = u; }
                else if (y > 1 - ty) { const u = (1 - y) / ty; if (u < d) d = u; }
                return d * 2 - 1;
            };
        }
        default:
            throw new Error(`Noise function ${node.NoiseType} is not supported yet`);
    }
}

/** Domain warping: each axis is displaced by the sum of its generators, each in [-amplitude, amplitude]. */
export function randomizer(json: JsonNode | undefined, load: Loader, scope: Scope): { x: Field; y: Field } {
    const axis = (name: 'X' | 'Y'): Field => {
        const gens = ((json?.Generators ?? []) as JsonNode[]).map((g, i) => ({
            f: compileField(g, load, { root: `${scope.root}.${name}-Noise#${i}`, path: `${scope.root}.${name}-Noise#${i}${scope.path.slice(scope.root.length)}` }),
            amp: g.Amplitude as number
        }));
        return (s, x, y) => {
            let off = 0;
            for (const g of gens) off += (g.f(s, x, y) * 2 - 1) * g.amp;
            return off;
        };
    };
    return { x: axis('X'), y: axis('Y') };
}

/** The settings every cell-based noise shares: jitter, density, distance range, skipping. */
export function cellOptions(node: JsonNode): CellOptions {
    if (node.CellType !== undefined && node.CellType !== 'SQUARE' && node.CellType !== 'HEX') throw new Error(`Cell type ${node.CellType} is not supported yet`);
    const jitter: number = node.Jitter ?? 1;
    const opts: CellOptions = { jitterX: node.JitterX ?? jitter, jitterY: node.JitterY ?? jitter };
    if (node.CellType === 'HEX') opts.hex = true;
    if (node.Measurement === 'BORDER_DISTANCE') opts.border = true;
    if (node.DistanceMode !== undefined) opts.distanceMode = node.DistanceMode as DistanceMode;
    if (node.Density !== undefined) {
        const d = node.Density;
        opts.density = typeof d === 'number' ? [[0, d]] : Array.isArray(d[0]) ? d : [d];
    }
    if (node.DistanceRange !== undefined) opts.distanceRange = range(node.DistanceRange);
    if (node.Skip) opts.skip = node.Skip;
    if (node.SkipMode) opts.skipMode = node.SkipMode;
    return opts;
}
