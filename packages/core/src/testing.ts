// Builders for synthetic BSON and region files, shared by the specs.
import { zstdCompressSync } from 'node:zlib';

export const cstr = (s: string) => Buffer.concat([Buffer.from(s), Buffer.from([0])]);
export const i32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(n);
    return b;
};
export function doc(...elements: Buffer[]) {
    const body = Buffer.concat([...elements, Buffer.from([0])]);
    return Buffer.concat([i32(body.length + 4), body]);
}
export const int32El = (k: string, v: number) => Buffer.concat([Buffer.from([0x10]), cstr(k), i32(v)]);
export const strEl = (k: string, v: string) =>
    Buffer.concat([Buffer.from([0x02]), cstr(k), i32(v.length + 1), cstr(v)]);
export const binEl = (k: string, v: number[]) =>
    Buffer.concat([Buffer.from([0x05]), cstr(k), i32(v.length), Buffer.from([0]), Buffer.from(v)]);
export const docEl = (k: string, d: Buffer) => Buffer.concat([Buffer.from([0x03]), cstr(k), d]);

export function region(chunks: Record<number, Buffer>): Uint8Array {
    const slots = 1024,
        segment = 4096;
    const header = Buffer.alloc(32);
    header.write('HytaleIndexedStorage');
    header.writeUInt32BE(1, 20);
    header.writeUInt32BE(slots, 24);
    header.writeUInt32BE(segment, 28);
    const table = Buffer.alloc(slots * 4);
    const blobs: Buffer[] = [];
    let next = 1;
    for (const [slot, raw] of Object.entries(chunks)) {
        const packed = zstdCompressSync(raw);
        const blob = Buffer.concat([Buffer.alloc(8), packed]);
        blob.writeUInt32BE(raw.length, 0);
        blob.writeUInt32BE(packed.length, 4);
        const padded = Buffer.alloc(Math.ceil(blob.length / segment) * segment);
        blob.copy(padded);
        table.writeUInt32BE(next, Number(slot) * 4);
        next += padded.length / segment;
        blobs.push(padded);
    }
    return Buffer.concat([header, table, ...blobs]);
}
