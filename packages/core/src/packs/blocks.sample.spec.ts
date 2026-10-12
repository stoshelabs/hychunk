// Against the real archives: HYCHUNK_ASSETS=/path/to/Assets.zip HYCHUNK_MOD=/path/to/Plugin.jar pnpm test
import { describe, expect, it } from 'vitest';
import { fromPath } from '../node';
import { buildBlockTable, SHAPE_CUBE, SHAPE_LEAVES, SHAPE_NONE, SHAPE_PLANT } from './blocks';
import { openZipPack } from './pack';

const assets = process.env.HYCHUNK_ASSETS;
const mod = process.env.HYCHUNK_MOD;

describe.skipIf(!assets)('block table', () => {
    it('describes the game blocks, and a plugin adds its own', async () => {
        const a = await fromPath(assets!);
        const m = mod ? await fromPath(mod) : null;
        try {
            const packs = [await openZipPack('Assets.zip', a)];
            if (m) packs.push(await openZipPack('plugin', m));
            const t = await buildBlockTable(packs);
            const n = Object.keys(t.blocks).length;
            expect(n).toBeGreaterThan(2900);
            const grass = t.blocks.Soil_Grass!;
            expect(grass.shape).toBe(SHAPE_CUBE);
            expect(grass.up).toMatch(/Soil_Grass/);
            expect(grass.down).toBe('BlockTextures/Soil_Dirt.png');
            expect(grass.tintUp).toBe(0x67b62d);
            expect(t.blocks.Wood_Oak_Trunk_Full!.north).toMatch(/Trunk_Oak_Side/);
            expect(t.blocks.Wood_Oak_Trunk_Full!.up).toMatch(/Trunk_Oak_Full/);
            expect(t.blocks.Plant_Leaves_Oak!.shape).toBe(SHAPE_LEAVES);
            expect(t.blocks.Plant_Leaves_Oak!.model).toMatch(/Ball\.blockymodel/);
            expect(t.blocks.Plant_Grass_Lush_Short!.shape).toBe(SHAPE_PLANT);
            expect(t.blocks.Wood_Torch_Wall!.shape).toBe(SHAPE_NONE);
            expect(Object.keys(t.fluids)).toContain('Water_Source');
            if (m) {
                expect(t.blocks.Voltis_Roller).toBeTruthy();
                console.log('blocks', n, 'Voltis_Roller', JSON.stringify(t.blocks.Voltis_Roller));
            }
        } finally {
            await a.close();
            await m?.close();
        }
    }, 120000);
});
