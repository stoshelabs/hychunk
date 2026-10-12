import { describe, expect, it } from 'vitest';
import * as fast from './hash';

// The BigInt version this replaced, kept here as the reference (it matched the game).
const M64 = (1n << 64n) - 1n;
const C1 = BigInt.asUintN(64, -4658895280553007687n);
const C2 = BigInt.asUintN(64, -7723592293110705685n);
const C3 = BigInt.asUintN(64, -6389720478792763523n);
const u = (v: number | bigint) => BigInt.asUintN(64, typeof v === 'bigint' ? v : BigInt(v));
function h1(v: bigint): bigint {
    v = (((v >> 30n) ^ v) * C1) & M64;
    v = (((v >> 27n) ^ v) * C2) & M64;
    return (v >> 31n) ^ v;
}
const ref = {
    hash2(a: number | bigint, b: number | bigint) { let l = u(a); l = (((h1(l) >> 30n) ^ l) * C1) & M64; return (h1(u(b)) >> 31n) ^ l; },
    hash3(a: number | bigint, b: number | bigint, c: number | bigint) {
        let l = u(a); l = (((h1(l) >> 30n) ^ l) * C1) & M64; l = (((h1(u(b)) >> 27n) ^ l) * C2) & M64; return (h1(u(c)) >> 31n) ^ l;
    },
    hash4(a: number | bigint, b: number | bigint, c: number | bigint, d: number | bigint) {
        let l = u(a); l = (((h1(l) >> 30n) ^ l) * C1) & M64; l = (((h1(u(b)) >> 27n) ^ l) * C2) & M64; l = (((h1(u(c)) >> 30n) ^ l) * C3) & M64; return (h1(u(d)) >> 31n) ^ l;
    },
    toUnit: (h: bigint) => Number(h & 0xffffffffn) / 4294967295
};

// a deterministic spread of arguments: small, negative, large ints, beyond-int numbers and whole longs
let s = 123456789;
const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return s; };
const args: (number | bigint)[] = [0, 1, -1, 2, -2, 31, 1000, -1000, 2147483647, -2147483648, 1659788403585, -5000000000, 5647422603192711886n, -4658895280553007687n, 0x7fffffffffffffffn];
for (let i = 0; i < 40; i++) args.push(rnd(), rnd() % 4096, BigInt(rnd()) * 4294967296n + BigInt(rnd() >>> 0));

describe('fast 64-bit hash equals the BigInt one', () => {
    it('hash2, hash3, hash4', () => {
        for (let i = 0; i < args.length; i++) {
            const a = args[i]!, b = args[(i * 7 + 3) % args.length]!, c = args[(i * 13 + 5) % args.length]!, d = args[(i * 5 + 11) % args.length]!;
            expect(fast.hash2(a, b)).toBe(ref.hash2(a, b));
            expect(fast.hash3(a, b, c)).toBe(ref.hash3(a, b, c));
            expect(fast.hash4(a, b, c, d)).toBe(ref.hash4(a, b, c, d));
        }
    });
    it('rehash, random and the int forms', () => {
        for (let i = 0; i < args.length; i++) {
            const a = args[i]!, b = args[(i * 7 + 3) % args.length]!, c = args[(i * 13 + 5) % args.length]!;
            expect(fast.rehash2(a, b)).toBe(h1(ref.hash2(a, b)));
            expect(fast.rehash3(a, b, c)).toBe(h1(ref.hash3(a, b, c)));
            expect(fast.rehash3Int(a, b, c)).toBe(Number(BigInt.asIntN(32, h1(ref.hash3(a, b, c)))));
            expect(fast.hash3Low(a, b, c)).toBe(Number(BigInt.asIntN(32, ref.hash3(a, b, c))));
            expect(fast.random2(a, b)).toBe(ref.toUnit(h1(ref.hash2(a, b))));
            expect(fast.random3(a, b, c)).toBe(ref.toUnit(h1(ref.hash3(a, b, c))));
            expect(fast.random1(a)).toBe(ref.toUnit(h1(h1(u(a)))));
        }
    });
});
