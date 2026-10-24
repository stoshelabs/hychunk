const MIN_RANDOM_SEED = 1_000_000_000;
const MAX_SEED = 2_147_483_647;

/** Generates a standard full-length 10-digit world seed as typically created by the game. */
export const randomSeed = () => Math.floor(MIN_RANDOM_SEED + Math.random() * (MAX_SEED - MIN_RANDOM_SEED));

/** The generator works on the low 32 bits of a world's seed. */
export const seed32 = (seed: number | bigint | string) => Number(BigInt.asIntN(32, BigInt(seed)));

/** A number is used as is (wrapped to 32 bits); any other text is hashed, so every string is a valid seed. */
export function parseSeedValue(value: string): number {
    const text = value.trim();
    if (!text) return 0;
    try {
        return seed32(text);
    } catch {
        let hash = 0;
        for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
        return hash;
    }
}
