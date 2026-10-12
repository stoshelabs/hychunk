import { decompress as jsDecompress } from 'fzstd';
import { ZSTDDecoder } from 'zstddec';

let decoder: Promise<ZSTDDecoder | null> | null = null;

/** The WebAssembly decoder, started once per thread; `null` where WebAssembly is not available. */
function wasm() {
    return (decoder ??= (async () => {
        try {
            const d = new ZSTDDecoder();
            await d.init();
            return d;
        } catch {
            return null;
        }
    })());
}

/**
 * Decompresses a zstd frame of known output size. WebAssembly does about 1 GB/s,
 * the pure-JavaScript fallback about 70 MB/s, and chunks are decompressed by the thousand.
 */
export async function zstdDecompress(packed: Uint8Array, rawLength: number): Promise<Uint8Array> {
    const d = await wasm();
    return d ? d.decode(packed, rawLength) : jsDecompress(packed, new Uint8Array(rawLength));
}
