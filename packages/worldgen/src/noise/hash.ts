// The game's `HashUtil` on 64-bit longs. A long is kept as two 32-bit halves and multiplied with `Math.imul`, many
// times faster than BigInt, which was most of the time spent finding biomes and structures. The functions that
// return a whole long (`hash2`, `hash3`, `hash4`, `rehash2`, `rehash3`) still give a BigInt, for seeding a `FastRandom`.

const split = (v: bigint): [number, number] => [Number(BigInt.asIntN(32, v >> 32n)), Number(BigInt.asIntN(32, v))];
const [C1H, C1L] = split(-4658895280553007687n);
const [C2H, C2L] = split(-7723592293110705685n);
const [C3H, C3L] = split(-6389720478792763523n);

/** The result of the last 64-bit operation (module state, so nothing is allocated). */
let RH = 0;
let RL = 0;
/** A converted argument. */
let PH = 0;
let PL = 0;

/** High 32 bits of the unsigned 32 × 32 product. */
function mulhu(a: number, b: number): number {
    a >>>= 0; b >>>= 0;
    const a0 = a & 0xffff, a1 = a >>> 16, b0 = b & 0xffff, b1 = b >>> 16;
    const p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
    const mid = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
    return (p11 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16)) >>> 0;
}

/** (hi, lo) * (chi, clo) mod 2^64 into RH, RL. */
function mul(hi: number, lo: number, chi: number, clo: number) {
    RH = (mulhu(lo, clo) + Math.imul(hi, clo) + Math.imul(lo, chi)) | 0;
    RL = Math.imul(lo, clo);
}

/** `HashUtil.hash(long)` into RH, RL. */
function h1(hi: number, lo: number) {
    // v = (v >>> 30 ^ v) * C1
    let sh = hi ^ (hi >>> 30), sl = lo ^ ((hi << 2) | (lo >>> 30));
    mul(sh, sl, C1H, C1L);
    // v = (v >>> 27 ^ v) * C2
    sh = RH ^ (RH >>> 27); sl = RL ^ ((RH << 5) | (RL >>> 27));
    mul(sh, sl, C2H, C2L);
    // v = v >>> 31 ^ v
    sh = RH ^ (RH >>> 31); sl = RL ^ ((RH << 1) | (RL >>> 31));
    RH = sh; RL = sl;
}

/** Java widens an int to a long with its sign; anything else goes through BigInt. */
function pair(v: number | bigint) {
    if (typeof v === 'number' && (v | 0) === v) { PL = v; PH = v < 0 ? -1 : 0; return; }
    const b = BigInt.asUintN(64, typeof v === 'bigint' ? v : BigInt(v));
    PH = Number(BigInt.asIntN(32, b >> 32n));
    PL = Number(BigInt.asIntN(32, b));
}

/** First step of hash2/3/4: acc = (h(l1) >>> 30 ^ l1) * C1, into RH, RL. */
function first(aH: number, aL: number) {
    h1(aH, aL);
    mul((RH >>> 30) ^ aH, ((RH << 2) | (RL >>> 30)) ^ aL, C1H, C1L);
}

/** acc = (h(v) >>> n ^ acc) * C, from the acc in RH, RL. */
function next(vH: number, vL: number, n: number, ch: number, cl: number) {
    const aH = RH, aL = RL;
    h1(vH, vL);
    mul((RH >>> n) ^ aH, ((RH << (32 - n)) | (RL >>> n)) ^ aL, ch, cl);
}

/** result = h(v) >>> 31 ^ acc, from the acc in RH, RL. */
function last(vH: number, vL: number) {
    const aH = RH, aL = RL;
    h1(vH, vL);
    const sh = RH >>> 31, sl = (RH << 1) | (RL >>> 31);
    RH = sh ^ aH; RL = sl ^ aL;
}

type L = number | bigint;

function hash2r(a: L, b: L) {
    pair(a); const aH = PH, aL = PL;
    first(aH, aL);
    pair(b); last(PH, PL);
}

function hash3r(a: L, b: L, c: L) {
    pair(a); const aH = PH, aL = PL;
    first(aH, aL);
    pair(b); next(PH, PL, 27, C2H, C2L);
    pair(c); last(PH, PL);
}

function hash4r(a: L, b: L, c: L, d: L) {
    pair(a); const aH = PH, aL = PL;
    first(aH, aL);
    pair(b); next(PH, PL, 27, C2H, C2L);
    pair(c); next(PH, PL, 30, C3H, C3L);
    pair(d); last(PH, PL);
}

const whole = () => (BigInt(RH) << 32n) | BigInt(RL >>> 0);
const unsigned = () => BigInt.asUintN(64, whole());

export function hash2(a: L, b: L): bigint { hash2r(a, b); return unsigned(); }
export function hash3(a: L, b: L, c: L): bigint { hash3r(a, b, c); return unsigned(); }
export function hash4(a: L, b: L, c: L, d: L): bigint { hash4r(a, b, c, d); return unsigned(); }

export function rehash2(a: L, b: L): bigint { hash2r(a, b); h1(RH, RL); return unsigned(); }
export function rehash3(a: L, b: L, c: L): bigint { hash3r(a, b, c); h1(RH, RL); return unsigned(); }

/** `(int) HashUtil.rehash(a, b, c)`: the low 32 bits, without a BigInt. */
export function rehash3Int(a: L, b: L, c: L): number { hash3r(a, b, c); h1(RH, RL); return RL | 0; }
/** The low 32 bits of `hash(a, b, c)`. */
export function hash3Low(a: L, b: L, c: L): number { hash3r(a, b, c); return RL | 0; }

/** The low 32 bits of a long as a number in [0, 1]. */
const unit = () => (RL >>> 0) / 4294967295;

export function random1(a: L): number { pair(a); h1(PH, PL); h1(RH, RL); return unit(); }
export function random2(a: L, b: L): number { hash2r(a, b); h1(RH, RL); return unit(); }
export function random3(a: L, b: L, c: L): number { hash3r(a, b, c); h1(RH, RL); return unit(); }
export function random4(a: L, b: L, c: L, d: L): number { hash4r(a, b, c, d); h1(RH, RL); return unit(); }

/** Java's `(int) long`. */
export const toInt32 = (h: bigint) => Number(BigInt.asIntN(32, h));
