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

/** A file on a server that honours HTTP `Range`, so a world can be browsed without downloading it. */
export async function fromUrl(url: string): Promise<ByteSource> {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) throw new Error(`${url}: ${head.status}`);
    const size = Number(head.headers.get('content-length'));
    return {
        size,
        async read(offset, length) {
            const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
            if (res.status !== 206 && res.status !== 200) throw new Error(`${url}: ${res.status}`);
            return new Uint8Array(await res.arrayBuffer());
        }
    };
}
