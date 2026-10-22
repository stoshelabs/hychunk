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

/**
 * `BlockChunk.Data`: a flag byte, the height palette (`u16` count, `i16` keys, `i32` length, 10-bit ids; saves up to version 3
 * only, the heights moved to their own component in version 4), then the tint palette (`i32` keys).
 */
export function readTint(chunk: BsonDocument): Int32Array | null {
    const data = asDoc(asDoc(chunk.Components)?.BlockChunk)?.Data as Uint8Array | undefined;
    if (!data) return null;
    try {
        const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let o = 1;
        if (((asDoc(asDoc(chunk.Components)?.BlockChunk)?.Version as number | undefined) ?? 3) < 4) {
            o += 2 + v.getUint16(o, true) * 2;
            o += 4 + v.getInt32(o, true);
        }
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

/**
 * The environment at `ys[col]` for the columns where that is >= 0. Saves up to version 3 keep it in one `EnvironmentChunk.Data`:
 * `i32` count, `{i32 id, utf8 name}`, then per column `i32 n`, `n` ascending max ys, `n + 1` ids (big endian). Later saves keep it
 * per section (`readSectionEnvironments`).
 */
export function readEnvironments(chunk: BsonDocument, ys: Int16Array): (string | null)[] | null {
    const data = asDoc(asDoc(chunk.Components)?.EnvironmentChunk)?.Data as Uint8Array | undefined;
    if (!data) return readSectionEnvironments(chunk, ys);
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

/** One section's `Environment.Data`, read to a lookup of (column, y inside the section). */
function readEnvironmentSection(data: Uint8Array): (col: number, y: number) => string | null {
    let o = 0;
    const varInt = () => {
        let value = 0,
            shift = 0;
        for (;;) {
            const b = data[o++]!;
            value |= (b & 0x7f) << shift;
            if (!(b & 0x80)) return value;
            shift += 7;
        }
    };
    const td = new TextDecoder();
    const palette: string[] = [];
    for (let i = 0, n = varInt(); i < n; i++) {
        const len = (data[o]! << 8) | data[o + 1]!;
        palette.push(td.decode(data.subarray(o + 2, o + 2 + len)));
        o += 2 + len;
    }
    const mode = data[o++]!;
    if (mode === 0) {
        const name = palette[varInt()] ?? null;
        return () => name;
    }
    /** A column's runs: the max y of each run but the last, then the palette index of each run. */
    const record = () => {
        const boundaries = data[o++]!;
        const maxYs: number[] = [];
        for (let r = 0; r < boundaries; r++) maxYs.push(data[o++]!);
        const values: number[] = [];
        for (let r = 0; r <= boundaries; r++) values.push(varInt());
        return { maxYs, values };
    };
    const columns: { maxYs: number[]; values: number[] }[] = [];
    if (mode === 1) {
        for (let c = 0; c < 1024; c++) columns.push(record());
    } else {
        const unique: { maxYs: number[]; values: number[] }[] = [];
        for (let i = 0, n = varInt(); i < n; i++) unique.push(record());
        const bits = unique.length <= 1 ? 0 : 32 - Math.clz32(unique.length - 1);
        let acc = 0,
            have = 0;
        for (let c = 0; c < 1024; c++) {
            while (have < bits) {
                acc = ((acc << 8) | data[o++]!) >>> 0;
                have += 8;
            }
            have -= bits;
            columns.push(unique[(acc >>> have) & ((1 << bits) - 1)] ?? unique[0]!);
            acc &= (1 << have) - 1;
        }
    }
    return (col, y) => {
        const { maxYs, values } = columns[col]!;
        let k = maxYs.length;
        for (let i = 0; i < maxYs.length; i++)
            if (y <= maxYs[i]!) {
                k = i;
                break;
            }
        return palette[values[k]!] ?? null;
    };
}

/** Environments of the saves that keep one per section (`ChunkColumn.Sections[i].Components.Environment`). */
function readSectionEnvironments(chunk: BsonDocument, ys: Int16Array): (string | null)[] | null {
    const sections = asDoc(asDoc(chunk.Components)?.ChunkColumn)?.Sections as BsonDocument[] | undefined;
    if (!sections) return null;
    const lookups = new Map<number, ((col: number, y: number) => string | null) | null>();
    const out = new Array<string | null>(1024).fill(null);
    let any = false;
    for (let col = 0; col < 1024; col++) {
        const y = ys[col]!;
        if (y < 0) continue;
        const index = y >> 5;
        let lookup = lookups.get(index);
        if (lookup === undefined) {
            const data = asDoc(asDoc(sections[index]?.Components)?.Environment)?.Data as Uint8Array | undefined;
            try {
                lookup = data ? readEnvironmentSection(data) : null;
            } catch {
                lookup = null;
            }
            lookups.set(index, lookup);
        }
        if (!lookup) continue;
        out[col] = lookup(col, y & 31);
        any = true;
    }
    return any ? out : null;
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
