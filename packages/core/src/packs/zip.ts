import type { ByteSource } from '../storage/source';

export interface ZipEntry {
    path: string;
    /** 0 stored, 8 deflate. */
    method: number;
    compressed: number;
    size: number;
    offset: number;
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));
const text = new TextDecoder();

/**
 * A zip read in place: only the central directory is loaded, and each file is fetched
 * by its offset when asked for. It handles zip64, so a 3 GB game archive is fine.
 */
export class ZipReader {
    private constructor(
        private readonly source: ByteSource,
        readonly entries: Map<string, ZipEntry>
    ) {}

    static async open(source: ByteSource): Promise<ZipReader> {
        // The end-of-central-directory record is in the last 64 KB plus its own 22 bytes.
        const tailLen = Math.min(source.size, 65557);
        const tail = await source.read(source.size - tailLen, tailLen);
        const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
        let eocd = -1;
        for (let i = tail.byteLength - 22; i >= 0; i--) {
            if (u32(tv, i) === 0x06054b50) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record)');
        let entries = u16(tv, eocd + 10);
        let cdSize = u32(tv, eocd + 12);
        let cdOffset = u32(tv, eocd + 16);

        if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
            // zip64: the locator sits right before the classic record and points at the real one.
            const loc = eocd - 20;
            if (loc < 0 || u32(tv, loc) !== 0x07064b50) throw new Error('Zip64 locator missing');
            const at = u64(tv, loc + 8);
            const rec = await source.read(at, 56);
            const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
            if (u32(rv, 0) !== 0x06064b50) throw new Error('Zip64 end record missing');
            entries = u64(rv, 32);
            cdSize = u64(rv, 40);
            cdOffset = u64(rv, 48);
        }

        const cd = await source.read(cdOffset, cdSize);
        const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
        const map = new Map<string, ZipEntry>();
        let p = 0;
        for (let i = 0; i < entries && p + 46 <= cd.byteLength; i++) {
            if (u32(v, p) !== 0x02014b50) throw new Error('Corrupt zip central directory');
            const method = u16(v, p + 10);
            let compressed = u32(v, p + 20);
            let size = u32(v, p + 24);
            const nameLen = u16(v, p + 28),
                extraLen = u16(v, p + 30),
                commentLen = u16(v, p + 32);
            let offset = u32(v, p + 42);
            const path = text.decode(cd.subarray(p + 46, p + 46 + nameLen));
            if (size === 0xffffffff || compressed === 0xffffffff || offset === 0xffffffff) {
                // zip64 extra field: only the fields that overflowed, in this order.
                let e = p + 46 + nameLen;
                const end = e + extraLen;
                while (e + 4 <= end) {
                    const id = u16(v, e),
                        len = u16(v, e + 2);
                    if (id === 0x0001) {
                        let q = e + 4;
                        if (size === 0xffffffff) {
                            size = u64(v, q);
                            q += 8;
                        }
                        if (compressed === 0xffffffff) {
                            compressed = u64(v, q);
                            q += 8;
                        }
                        if (offset === 0xffffffff) offset = u64(v, q);
                        break;
                    }
                    e += 4 + len;
                }
            }
            if (!path.endsWith('/')) map.set(path, { path, method, compressed, size, offset });
            p += 46 + nameLen + extraLen + commentLen;
        }
        return new ZipReader(source, map);
    }

    has(path: string) {
        return this.entries.has(path);
    }

    /** Paths that start with `prefix`, in archive order. */
    list(prefix = ''): string[] {
        const out: string[] = [];
        for (const k of this.entries.keys()) if (k.startsWith(prefix)) out.push(k);
        return out;
    }

    /** The file's bytes, inflated if it was compressed. */
    async read(path: string): Promise<Uint8Array> {
        const e = this.entries.get(path);
        if (!e) throw new Error(`Not in the archive: ${path}`);
        // The local header repeats the name and has its own extra field, so its length has to be read.
        const head = await this.source.read(e.offset, 30);
        const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
        if (u32(hv, 0) !== 0x04034b50) throw new Error(`Corrupt zip entry: ${path}`);
        const start = e.offset + 30 + u16(hv, 26) + u16(hv, 28);
        const data = await this.source.read(start, e.compressed);
        if (e.method === 0) return data;
        if (e.method !== 8) throw new Error(`Unsupported zip method ${e.method}: ${path}`);
        return inflateRaw(data);
    }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
