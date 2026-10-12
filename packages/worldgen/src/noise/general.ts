// Shared helpers of the generator's noise library, ported from the game's `GeneralNoise`.
// Java `int` arithmetic wraps at 32 bits, so every product goes through Math.imul and every
// result is forced back to an int with `| 0`; `double` maps to number as it is.

export const X_PRIME = 1619;
export const Y_PRIME = 31337;
export const Z_PRIME = 6971;

const GRAD_2D: readonly (readonly [number, number])[] = [
    [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [0, 1], [1, 0]
];

const GRAD_3D: readonly (readonly [number, number, number])[] = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [0, -1, 1], [-1, 1, 0], [0, -1, -1]
];

/** Java's `(int) d`: truncates toward zero and saturates; NaN is 0. */
export function toInt(d: number): number {
    if (d !== d) return 0;
    if (d >= 2147483647) return 2147483647;
    if (d <= -2147483648) return -2147483648;
    return d < 0 ? Math.ceil(d) : Math.floor(d);
}

export function fastFloor(f: number): number {
    return f >= 0 ? toInt(f) : toInt(f) - 1;
}

export function fastCeil(f: number): number {
    return f >= 0 ? toInt(f) + 1 : toInt(f);
}

export const lerp = (a: number, b: number, t: number) => a + t * (b - a);

export function hash2D(seed: number, x: number, y: number): number {
    let hash = seed | 0;
    hash ^= Math.imul(X_PRIME, x);
    hash ^= Math.imul(Y_PRIME, y);
    hash = Math.imul(Math.imul(Math.imul(hash, hash), hash), 60493);
    return (hash >> 13) ^ hash;
}

export function hash3D(seed: number, x: number, y: number, z: number): number {
    let hash = seed | 0;
    hash ^= Math.imul(X_PRIME, x);
    hash ^= Math.imul(Y_PRIME, y);
    hash ^= Math.imul(Z_PRIME, z);
    hash = Math.imul(Math.imul(Math.imul(hash, hash), hash), 60493);
    return (hash >> 13) ^ hash;
}

export function gradCoord2D(seed: number, x: number, y: number, xd: number, yd: number): number {
    const g = GRAD_2D[hash2D(seed, x, y) & 7]!;
    return xd * g[0] + yd * g[1];
}

export function gradCoord3D(seed: number, x: number, y: number, z: number, xd: number, yd: number, zd: number): number {
    const g = GRAD_3D[hash3D(seed, x, y, z) & 0xf]!;
    return xd * g[0] + yd * g[1] + zd * g[2];
}

export const limit = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type Interpolation = (t: number) => number;

export const interpolation: Record<'LINEAR' | 'HERMITE' | 'QUINTIC', Interpolation> = {
    LINEAR: (t) => t,
    HERMITE: (t) => t * t * (3 - 2 * t),
    QUINTIC: (t) => t * t * t * (t * (t * 6 - 15) + 10)
};
