// Against the real archives: HYCHUNK_ASSETS=/path/to/Assets.zip HYCHUNK_MOD=/path/to/Plugin.jar pnpm test
import { describe, expect, it } from 'vitest';
import { fromPath } from '../node';
import { ZipReader } from './zip';

const assets = process.env.HYCHUNK_ASSETS;
const mod = process.env.HYCHUNK_MOD;

describe.skipIf(!assets)('Assets.zip', () => {
    it('opens a multi-gigabyte archive and reads a texture and a definition', async () => {
        const src = await fromPath(assets!);
        try {
            const z = await ZipReader.open(src);
            expect(z.entries.size).toBeGreaterThan(50000);
            const png = await z.read('Common/BlockTextures/Rock_Stone.png');
            expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // "PNG"
            const def = JSON.parse(
                new TextDecoder().decode(await z.read('Server/Item/Items/Soil/Grass/Soil_Grass.json'))
            );
            expect(def.BlockType.Material).toBe('Solid');
        } finally {
            await src.close();
        }
    }, 60000);
});

describe.skipIf(!mod)('plugin jar', () => {
    it('reads a deflated block definition', async () => {
        const src = await fromPath(mod!);
        try {
            const z = await ZipReader.open(src);
            const defs = z.list('Server/Item/Items/');
            expect(defs.length).toBeGreaterThan(0);
            expect(JSON.parse(new TextDecoder().decode(await z.read(defs[0]!)))).toBeTypeOf('object');
        } finally {
            await src.close();
        }
    });
});
