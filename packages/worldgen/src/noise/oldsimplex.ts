import { toInt } from './general';

// Ported from the game's `OldSimplexNoise` (2D only: no data file uses the 3D form).
// It is the older OpenSimplex-style noise with a different gradient set than `simplex2`.

const STRETCH_2D = -0.211324865405187;
const SQUISH_2D = 0.366025403784439;
const NORM_2D = 47;

const GRAD_X = [5, 2, -5, -2, 5, 2, -5, -2];
const GRAD_Y = [2, 5, 2, 5, -2, -5, -2, -5];

const floor = (x: number) => {
    const xi = toInt(x);
    return x < xi ? xi - 1 : xi;
};

function extrapolate(seed: number, x: number, y: number, xd: number, yd: number): number {
    let hash = seed | 0;
    hash ^= Math.imul(1619, x);
    hash ^= Math.imul(31337, y);
    hash = Math.imul(Math.imul(Math.imul(hash, hash), hash), 60493);
    hash = (hash >> 13) ^ hash;
    const g = hash & 7;
    return xd * GRAD_X[g]! + yd * GRAD_Y[g]!;
}

/** 2D old simplex noise, in about [-1, 1]. */
export function oldSimplex2(_seed: number, offsetSeed: number, x: number, y: number): number {
    const stretch = (x + y) * STRETCH_2D;
    const xs = x + stretch, ys = y + stretch;
    let xsb = floor(xs), ysb = floor(ys);
    const squish = (xsb + ysb) * SQUISH_2D;
    const xb = xsb + squish, yb = ysb + squish;
    const xins = xs - xsb, yins = ys - ysb;
    const inSum = xins + yins;
    let dx0 = x - xb, dy0 = y - yb;
    let value = 0;

    const dx1 = dx0 - 1 - SQUISH_2D, dy1 = dy0 - 0 - SQUISH_2D;
    let attn1 = 2 - dx1 * dx1 - dy1 * dy1;
    if (attn1 > 0) {
        attn1 *= attn1;
        value += attn1 * attn1 * extrapolate(offsetSeed, xsb + 1, ysb + 0, dx1, dy1);
    }
    const dx2 = dx0 - 0 - SQUISH_2D, dy2 = dy0 - 1 - SQUISH_2D;
    let attn2 = 2 - dx2 * dx2 - dy2 * dy2;
    if (attn2 > 0) {
        attn2 *= attn2;
        value += attn2 * attn2 * extrapolate(offsetSeed, xsb + 0, ysb + 1, dx2, dy2);
    }

    let xsvExt: number, ysvExt: number, dxExt: number, dyExt: number;
    if (inSum <= 1) {
        const zins = 1 - inSum;
        if (zins > xins || zins > yins) {
            if (xins > yins) { xsvExt = xsb + 1; ysvExt = ysb - 1; dxExt = dx0 - 1; dyExt = dy0 + 1; }
            else { xsvExt = xsb - 1; ysvExt = ysb + 1; dxExt = dx0 + 1; dyExt = dy0 - 1; }
        } else {
            xsvExt = xsb + 1; ysvExt = ysb + 1;
            dxExt = dx0 - 1 - 0.732050807568878; dyExt = dy0 - 1 - 0.732050807568878;
        }
    } else {
        const zins = 2 - inSum;
        if (zins < xins || zins < yins) {
            if (xins > yins) {
                xsvExt = xsb + 2; ysvExt = ysb + 0;
                dxExt = dx0 - 2 - 0.732050807568878; dyExt = dy0 + 0 - 0.732050807568878;
            } else {
                xsvExt = xsb + 0; ysvExt = ysb + 2;
                dxExt = dx0 + 0 - 0.732050807568878; dyExt = dy0 - 2 - 0.732050807568878;
            }
        } else {
            dxExt = dx0; dyExt = dy0; xsvExt = xsb; ysvExt = ysb;
        }
        xsb++;
        ysb++;
        dx0 = dx0 - 1 - 0.732050807568878;
        dy0 = dy0 - 1 - 0.732050807568878;
    }
    let attn0 = 2 - dx0 * dx0 - dy0 * dy0;
    if (attn0 > 0) {
        attn0 *= attn0;
        value += attn0 * attn0 * extrapolate(offsetSeed, xsb, ysb, dx0, dy0);
    }
    let attnExt = 2 - dxExt * dxExt - dyExt * dyExt;
    if (attnExt > 0) {
        attnExt *= attnExt;
        value += attnExt * attnExt * extrapolate(offsetSeed, xsvExt, ysvExt, dxExt, dyExt);
    }
    return value / NORM_2D;
}
