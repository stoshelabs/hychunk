import { fastFloor, gradCoord2D, gradCoord3D } from './general';

// Ported from the game's `SimplexNoise`. `seed` is unused by the original (only `offsetSeed` reaches the gradient hash).

/** 2D simplex noise, in about [-1, 1]. */
export function simplex2(_seed: number, offsetSeed: number, x: number, y: number): number {
    let t = (x + y) * 0.5;
    const i = fastFloor(x + t);
    const j = fastFloor(y + t);
    t = (i + j) * 0.25;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    let n0: number, n1: number, n2: number;
    t = 0.5 - x0 * x0 - y0 * y0;
    if (t < 0) n0 = 0;
    else { t *= t; n0 = t * t * gradCoord2D(offsetSeed, i, j, x0, y0); }

    const x1 = x0 - i1 + 0.25;
    const y1 = y0 - j1 + 0.25;
    t = 0.5 - x1 * x1 - y1 * y1;
    if (t < 0) n1 = 0;
    else { t *= t; n1 = t * t * gradCoord2D(offsetSeed, (i + i1) | 0, (j + j1) | 0, x1, y1); }

    const x2 = x0 + -0.5;
    const y2 = y0 + -0.5;
    t = 0.5 - x2 * x2 - y2 * y2;
    if (t < 0) n2 = 0;
    else { t *= t; n2 = t * t * gradCoord2D(offsetSeed, (i + 1) | 0, (j + 1) | 0, x2, y2); }

    return 50 * (n0 + n1 + n2);
}

/** 3D simplex noise, in about [-1, 1]. */
export function simplex3(_seed: number, offsetSeed: number, x: number, y: number, z: number): number {
    let t = (x + y + z) * 0.3333333333333333;
    const i = fastFloor(x + t);
    const j = fastFloor(y + t);
    const k = fastFloor(z + t);
    t = (i + j + k) * 0.16666666666666666;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }

    const x1 = x0 - i1 + 0.16666666666666666;
    const y1 = y0 - j1 + 0.16666666666666666;
    const z1 = z0 - k1 + 0.16666666666666666;
    const x2 = x0 - i2 + 0.3333333333333333;
    const y2 = y0 - j2 + 0.3333333333333333;
    const z2 = z0 - k2 + 0.3333333333333333;
    const x3 = x0 + -0.5;
    const y3 = y0 + -0.5;
    const z3 = z0 + -0.5;

    let n0: number, n1: number, n2: number, n3: number;
    t = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t < 0) n0 = 0;
    else { t *= t; n0 = t * t * gradCoord3D(offsetSeed, i, j, k, x0, y0, z0); }
    t = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t < 0) n1 = 0;
    else { t *= t; n1 = t * t * gradCoord3D(offsetSeed, (i + i1) | 0, (j + j1) | 0, (k + k1) | 0, x1, y1, z1); }
    t = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t < 0) n2 = 0;
    else { t *= t; n2 = t * t * gradCoord3D(offsetSeed, (i + i2) | 0, (j + j2) | 0, (k + k2) | 0, x2, y2, z2); }
    t = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t < 0) n3 = 0;
    else { t *= t; n3 = t * t * gradCoord3D(offsetSeed, (i + 1) | 0, (j + 1) | 0, (k + 1) | 0, x3, y3, z3); }

    return 32 * (n0 + n1 + n2 + n3);
}
