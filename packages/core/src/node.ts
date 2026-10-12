// Node-only helpers, kept out of the main entry so the browser build never sees `node:fs`.
import { open } from 'node:fs/promises';
import type { ByteSource } from './storage/source';

export async function fromPath(path: string): Promise<ByteSource & { close(): Promise<void> }> {
    const handle = await open(path, 'r');
    const { size } = await handle.stat();
    return {
        size,
        async read(offset, length) {
            const buffer = new Uint8Array(length);
            const { bytesRead } = await handle.read(buffer, 0, length, offset);
            return buffer.subarray(0, bytesRead);
        },
        close: () => handle.close()
    };
}
