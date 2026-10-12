const MAX_SEED = 2147483647;

export const randomSeed = () => Math.floor(Math.random() * MAX_SEED);

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
