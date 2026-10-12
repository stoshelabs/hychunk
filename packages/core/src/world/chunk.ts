import type { BsonDocument } from '../bson/reader';
import { readSectionPalette, type SectionPalette } from './palette';

export const CHUNK_SIZE = 32;
export const CHUNK_HEIGHT = 320;
export const SECTION_COUNT = 10;

/** Column index inside a chunk: `z << 5 | x`. */
export const columnOf = (x: number, z: number) => (z << 5) | x;

const asDoc = (v: unknown) => v as BsonDocument | undefined;

function sectionComponent(chunk: BsonDocument, index: number, name: 'Block' | 'Fluid'): Uint8Array | undefined {
    const sections = asDoc(asDoc(chunk.Components)?.ChunkColumn)?.Sections as BsonDocument[] | undefined;
    return asDoc(asDoc(sections?.[index]?.Components)?.[name])?.Data as Uint8Array | undefined;
}

/** The block palette of section `index` (0 is the bottom), or `null` when the chunk has none there. */
export function readBlockSection(chunk: BsonDocument, index: number): SectionPalette | null {
    const data = sectionComponent(chunk, index, 'Block');
    // A `u32` migration count comes first, then the palette.
    return data ? readSectionPalette(data, 4) : null;
}

/** The fluid palette of section `index`; same layout as blocks, without the leading `u32`. */
export function readFluidSection(chunk: BsonDocument, index: number): SectionPalette | null {
    const data = sectionComponent(chunk, index, 'Fluid');
    return data ? readSectionPalette(data, 0) : null;
}

/** `BlockChunk.Data`: a flag byte, the height palette (`u16` count, `i16` keys, `i32` length, 10-bit ids), then the tint palette (`i32` keys). */
export function readTint(chunk: BsonDocument): Int32Array | null {
    const data = asDoc(asDoc(chunk.Components)?.BlockChunk)?.Data as Uint8Array | undefined;
    if (!data) return null;
    try {
        const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let o = 1;
        o += 2 + v.getUint16(o, true) * 2;
        o += 4 + v.getInt32(o, true);
        const count = v.getUint16(o, true);
        if (count === 0) return null;
        const keys = new Int32Array(count);
        for (let i = 0; i < count; i++) keys[i] = v.getInt32(o + 2 + i * 4, true) & 0xffffff;
        o += 2 + count * 4 + 4;
        const out = new Int32Array(1024);
        for (let i = 0; i < 1024; i++) {
            // ids are 10 bits wide, least significant bit first
            let bit = i * 10,
                id = 0;
            for (let n = 0; n < 10; n++, bit++) id |= ((data[o + (bit >> 3)]! >> (bit & 7)) & 1) << n;
            out[i] = keys[id < count ? id : 0]!;
        }
        return out;
    } catch {
        return null;
    }
}

/** `EnvironmentChunk.Data`: `i32` count, `{i32 id, utf8 name}`, then per column `i32 n`, `n` ascending max ys, `n + 1` ids (big endian). Returns the name at `ys[col]` for the columns where that is >= 0. */
export function readEnvironments(chunk: BsonDocument, ys: Int16Array): (string | null)[] | null {
    const data = asDoc(asDoc(chunk.Components)?.EnvironmentChunk)?.Data as Uint8Array | undefined;
    if (!data) return null;
    try {
        const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const names = new Map<number, string>();
        const count = v.getInt32(0);
        let o = 4;
        const td = new TextDecoder();
        for (let i = 0; i < count; i++) {
            const id = v.getInt32(o),
                len = v.getUint16(o + 4);
            names.set(id, td.decode(data.subarray(o + 6, o + 6 + len)));
            o += 6 + len;
        }
        const out = new Array<string | null>(1024).fill(null);
        for (let col = 0; col < 1024; col++) {
            const n = v.getInt32(o);
            const y = ys[col]!;
            let k = n;
            if (y >= 0)
                for (let i = 0; i < n; i++)
                    if (y <= v.getInt32(o + 4 + i * 4)) {
                        k = i;
                        break;
                    }
            if (y >= 0) out[col] = names.get(v.getInt32(o + 4 + n * 4 + k * 4)) ?? null;
            o += 4 + n * 4 + (n + 1) * 4;
        }
        return out;
    } catch {
        return null;
    }
}

const isEmpty = (p: SectionPalette) => p.names.length === 1 && p.names[0] === 'Empty';

export interface ChunkSurface {
    /** Name of the topmost non-empty block of each column (`columnOf`), `Empty` for a hollow column. */
    block: string[];
    /** Its y, or -1 for a hollow column. */
    blockY: Int16Array;
    /** The ground's y without what grows on it, when it is known apart (predicted chunks): the map shades by it, so plants do not speckle the relief. */
    groundY?: Int16Array;
    /** Name of the topmost fluid of each column, or `null` when there is none. */
    fluid: (string | null)[];
    /** Its y, or -1. */
    fluidY: Int16Array;
    /** The chunk's biome tint (0xRRGGBB) of each column, when the chunk has one. */
    tint?: Int32Array;
    /** The environment at the top of each fluid column (for the water tint), `null` elsewhere. */
    env?: (string | null)[];
}

/**
 * What a top-down map shows: the highest block and the highest fluid in every
 * column. Sections that are entirely empty are skipped without decoding blocks.
 * The stored heightmap is not used — it is sparse in saved chunks.
 */
export function readSurface(chunk: BsonDocument): ChunkSurface {
    const block = new Array<string>(1024).fill('Empty');
    const blockY = new Int16Array(1024).fill(-1);
    const fluid = new Array<string | null>(1024).fill(null);
    const fluidY = new Int16Array(1024).fill(-1);
    let openBlocks = 1024;
    let openFluids = 1024;

    for (let s = SECTION_COUNT - 1; s >= 0 && (openBlocks > 0 || openFluids > 0); s--) {
        const blocks = openBlocks > 0 ? readBlockSection(chunk, s) : null;
        const fluids = openFluids > 0 ? readFluidSection(chunk, s) : null;
        const scanBlocks = blocks && !isEmpty(blocks) ? blocks : null;
        const scanFluids = fluids && !isEmpty(fluids) ? fluids : null;
        if (!scanBlocks && !scanFluids) continue;
        // Which palette entries are `Empty`, decided once per palette instead of per block.
        const solidB = scanBlocks ? scanBlocks.names.map((n) => n !== 'Empty') : null;
        const solidF = scanFluids ? scanFluids.names.map((n) => n !== 'Empty') : null;
        for (let col = 0; col < 1024; col++) {
            const needB = scanBlocks !== null && blockY[col]! < 0;
            const needF = scanFluids !== null && fluidY[col]! < 0;
            if (!needB && !needF) continue;
            let wantB = needB,
                wantF = needF;
            for (let ly = 31; ly >= 0 && (wantB || wantF); ly--) {
                const i = (ly << 10) | col;
                if (wantB) {
                    const k = scanBlocks!.indices[i]!;
                    if (solidB![k]) {
                        block[col] = scanBlocks!.names[k]!;
                        blockY[col] = s * 32 + ly;
                        openBlocks--;
                        wantB = false;
                    }
                }
                if (wantF) {
                    const k = scanFluids!.indices[i]!;
                    if (solidF![k]) {
                        fluid[col] = scanFluids!.names[k]!;
                        fluidY[col] = s * 32 + ly;
                        openFluids--;
                        wantF = false;
                    }
                }
            }
        }
    }
    const tint = readTint(chunk) ?? undefined;
    const env = openFluids < 1024 ? (readEnvironments(chunk, fluidY) ?? undefined) : undefined;
    return { block, blockY, fluid, fluidY, tint, env };
}
