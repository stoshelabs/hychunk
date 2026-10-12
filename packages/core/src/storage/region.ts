import { decodeBson, type BsonDocument } from '../bson/reader';
import type { ByteSource } from './source';
import { zstdDecompress } from './zstd';

const MAGIC = 'HytaleIndexedStorage';
const HEADER_SIZE = 32;
/** No real chunk is anywhere near this; a bigger length means the slot points at garbage. */
const MAX_BLOB = 1 << 28;
/** Most chunks compress to well under this, so one read gets the header and the data. */
const READ_AHEAD = 40 * 1024;

/** A slot whose blob is not where the table says: seen in long-lived saves. The chunk is lost, the rest of the region is fine. */
export class CorruptChunkError extends Error {
    constructor(
        readonly slot: number,
        reason: string
    ) {
        super(`Slot ${slot}: ${reason}`);
        this.name = 'CorruptChunkError';
    }
}

/**
 * A `X.Z.region.bin` file: a 32-byte header (magic, then big-endian version,
 * slot count and segment size), a table with one big-endian segment number per
 * slot, and the blobs. A slot holds the 1-based segment where its blob starts,
 * 0 when empty; a blob is `[uncompressed length][compressed length][zstd]`.
 */
export class RegionFile {
    private constructor(
        private readonly source: ByteSource,
        readonly slotCount: number,
        readonly segmentSize: number,
        private readonly table: Uint32Array
    ) {}

    static async open(source: ByteSource): Promise<RegionFile> {
        const head = await source.read(0, HEADER_SIZE);
        const name = String.fromCharCode(...head.subarray(0, MAGIC.length));
        if (name !== MAGIC) throw new Error('Not a Hytale region file (bad magic)');
        const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
        const version = view.getUint32(20);
        if (version !== 1) throw new Error(`Unsupported region version ${version}`);
        const slotCount = view.getUint32(24);
        const segmentSize = view.getUint32(28);
        const raw = await source.read(HEADER_SIZE, slotCount * 4);
        const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const table = new Uint32Array(slotCount);
        for (let i = 0; i < slotCount; i++) table[i] = rawView.getUint32(i * 4);
        return new RegionFile(source, slotCount, segmentSize, table);
    }

    has(slot: number): boolean {
        return this.table[slot]! !== 0;
    }

    /** Slots that hold a chunk, in file order. */
    slots(): number[] {
        const out: number[] = [];
        for (let i = 0; i < this.slotCount; i++) if (this.has(i)) out.push(i);
        return out;
    }

    /** The decompressed BSON bytes of a slot, or `null` when it is empty. */
    async readRaw(slot: number): Promise<Uint8Array | null> {
        const segment = this.table[slot]!;
        if (segment === 0) return null;
        const offset = HEADER_SIZE + this.slotCount * 4 + (segment - 1) * this.segmentSize;
        if (offset + 8 > this.source.size) throw new CorruptChunkError(slot, 'blob starts past the end of the file');
        const first = await this.source.read(offset, Math.min(8 + READ_AHEAD, this.source.size - offset));
        if (first.byteLength < 8) throw new CorruptChunkError(slot, 'blob starts past the end of the file');
        const view = new DataView(first.buffer, first.byteOffset, 8);
        const rawLength = view.getUint32(0);
        const packedLength = view.getUint32(4);
        if (
            rawLength === 0 ||
            rawLength > MAX_BLOB ||
            packedLength === 0 ||
            packedLength > MAX_BLOB ||
            offset + 8 + packedLength > this.source.size
        ) {
            throw new CorruptChunkError(slot, 'blob header is not a chunk');
        }
        const packed =
            first.byteLength >= 8 + packedLength
                ? first.subarray(8, 8 + packedLength)
                : await this.source.read(offset + 8, packedLength);
        if (packed[0] !== 0x28 || packed[1] !== 0xb5 || packed[2] !== 0x2f || packed[3] !== 0xfd)
            throw new CorruptChunkError(slot, 'blob is not zstd');
        let out: Uint8Array;
        try {
            out = await zstdDecompress(packed, rawLength);
        } catch {
            throw new CorruptChunkError(slot, 'zstd data is damaged');
        }
        if (out.byteLength !== rawLength)
            throw new CorruptChunkError(slot, `expected ${rawLength} bytes, got ${out.byteLength}`);
        return out;
    }

    async readChunk(slot: number): Promise<BsonDocument | null> {
        const raw = await this.readRaw(slot);
        return raw ? decodeBson(raw) : null;
    }
}

export const REGION_SIZE = 32;

/** Slot of a chunk inside its region; `x` and `z` are chunk coordinates local to the region (0–31). */
export const slotOf = (x: number, z: number) => x + z * REGION_SIZE;

/** Absolute chunk coordinates of a slot in region `rx.rz`. */
export const chunkOf = (rx: number, rz: number, slot: number) => ({
    cx: rx * REGION_SIZE + (slot % REGION_SIZE),
    cz: rz * REGION_SIZE + Math.floor(slot / REGION_SIZE)
});
