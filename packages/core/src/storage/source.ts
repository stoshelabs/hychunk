/** Random access to a file's bytes, so a multi-gigabyte region is never read whole. */
export interface ByteSource {
    readonly size: number;
    read(offset: number, length: number): Promise<Uint8Array>;
}

export function fromBytes(bytes: Uint8Array): ByteSource {
    return {
        size: bytes.byteLength,
        read: async (offset, length) => bytes.subarray(offset, offset + length)
    };
}

/** Works with `File` too, which is what a folder picker hands back. */
export function fromBlob(blob: Blob): ByteSource {
    return {
        size: blob.size,
        read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
    };
}

/**
 * A file on a server that honours HTTP `Range`, so a world can be browsed without downloading it. A server that compresses its
 * responses (GitHub Pages) ignores `Range` and gives the compressed length as the size: then the whole file is downloaded once.
 */
export async function fromUrl(url: string): Promise<ByteSource> {
    const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    if (!probe.ok) throw new Error(`${url}: ${probe.status}`);
    const total = /\/(\d+)$/.exec(probe.headers.get('content-range') ?? '')?.[1];
    if (probe.status !== 206 || !total) return fromBytes(new Uint8Array(await probe.arrayBuffer()));
    void probe.body?.cancel();
    let whole: Promise<Uint8Array> | null = null;
    return {
        size: Number(total),
        async read(offset, length) {
            if (whole) return (await whole).subarray(offset, offset + length);
            const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
            if (res.status === 206) return new Uint8Array(await res.arrayBuffer());
            if (res.status !== 200) throw new Error(`${url}: ${res.status}`);
            // the range was ignored this time: what came is the whole file, kept for every later read
            whole = res.arrayBuffer().then((b) => new Uint8Array(b));
            return (await whole).subarray(offset, offset + length);
        }
    };
}
