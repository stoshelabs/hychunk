// The game's `FastRandom`: the java.util.Random generator (48-bit linear congruential), seeded
// from a long. BigInt keeps the 48-bit products exact.

const MULT = 25214903917n;
const MASK = (1n << 48n) - 1n;

export class FastRandom {
    private seed: bigint;

    constructor(seed: bigint | number) {
        this.seed = ((BigInt.asUintN(64, BigInt(seed)) ^ 0x5deece66dn) & MASK);
    }

    /** `FastRandom.setSeed`: the same scramble as the constructor. */
    setSeed(seed: bigint | number) {
        this.seed = ((BigInt.asUintN(64, BigInt(seed)) ^ 0x5deece66dn) & MASK);
    }

    /** `Random.nextInt(bound)`. */
    nextInt(bound: number): number {
        let r = this.next(31);
        const m = bound - 1;
        if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> 31n);
        for (let u = r; u - (r = u % bound) + m > 0x7fffffff; u = this.next(31)) { /* retry */ }
        return r;
    }

    private next(bits: number): number {
        this.seed = (this.seed * MULT + 11n) & MASK;
        // (int) (seed >>> (48 - bits)), then taken as a signed 32-bit value
        return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
    }

    nextDouble(): number {
        const a = this.next(26), b = this.next(27);
        return (a * 134217728 + b) * (1 / 9007199254740992);
    }
}
