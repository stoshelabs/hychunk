import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fromBytes } from '../storage/source';
import { ZipReader } from './zip';

/** A tiny zip writer: enough to check the reader against both storage methods. */
function zip(files: Record<string, { data: string; deflate?: boolean }>): Uint8Array {
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const [name, f] of Object.entries(files)) {
        const raw = Buffer.from(f.data);
        const body = f.deflate ? deflateRawSync(raw) : raw;
        const n = Buffer.from(name);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(f.deflate ? 8 : 0, 8);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(n.length, 26);
        local.writeUInt16LE(4, 28); // an extra field the reader must skip over
        parts.push(local, n, Buffer.alloc(4), body);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(f.deflate ? 8 : 0, 10);
        c.writeUInt32LE(body.length, 20);
        c.writeUInt32LE(raw.length, 24);
        c.writeUInt16LE(n.length, 28);
        c.writeUInt32LE(offset, 42);
        central.push(c, n);
        offset += 30 + n.length + 4 + body.length;
    }
    const cd = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, end]);
}

describe('ZipReader', () => {
    it('reads stored and deflated files and lists by prefix', async () => {
        const z = await ZipReader.open(
            fromBytes(
                zip({
                    'Common/BlockTextures/Rock.png': { data: 'stone' },
                    'Server/Item/Items/Rock.json': { data: '{"a":1}'.repeat(50), deflate: true },
                    'Server/Item/Items/Dirt.json': { data: 'dirt', deflate: true }
                })
            )
        );
        expect(new TextDecoder().decode(await z.read('Common/BlockTextures/Rock.png'))).toBe('stone');
        expect(new TextDecoder().decode(await z.read('Server/Item/Items/Rock.json'))).toBe('{"a":1}'.repeat(50));
        expect(z.list('Server/Item/Items/')).toEqual(['Server/Item/Items/Rock.json', 'Server/Item/Items/Dirt.json']);
        expect(z.has('nope')).toBe(false);
        await expect(z.read('nope')).rejects.toThrow(/Not in the archive/);
    });
    it('rejects something that is not a zip', async () => {
        await expect(ZipReader.open(fromBytes(new Uint8Array(100)))).rejects.toThrow(/Not a zip/);
    });
});
