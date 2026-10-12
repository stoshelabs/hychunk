// HYCHUNK_SAMPLE=/path/to/world/chunks HYCHUNK_ASSETS=/path/Assets.zip pnpm test
import { describe, expect, it } from 'vitest';
import { RegionFile, readSurface } from '../index';
import { fromPath } from '../node';
import { buildBlockTable } from '../packs/blocks';
import { openZipPack } from '../packs/pack';
import { styledBlockColor, styledFluidColor, toMapStyle } from './mapStyle';

const dir = process.env.HYCHUNK_SAMPLE,
    assets = process.env.HYCHUNK_ASSETS;

describe.skipIf(!dir || !assets)('colours from the game files', () => {
    it('reads the chunk tint and environments and colours grass and water', async () => {
        const table = await buildBlockTable([await openZipPack('Assets.zip', await fromPath(assets!))]);
        const style = toMapStyle(table);
        expect(Object.keys(style.waterTint).length).toBeGreaterThan(10);
        const src = await fromPath(`${dir}/0.0.region.bin`);
        const r = await RegionFile.open(src);
        let grass = 0,
            water = 0;
        for (const slot of r.slots().slice(0, 40)) {
            const s = readSurface((await r.readChunk(slot))!);
            expect(s.tint).toBeDefined();
            for (let c = 0; c < 1024; c += 37) {
                if (s.block[c]!.startsWith('Soil_Grass')) {
                    const col = styledBlockColor(style, s.block[c]!, s.tint![c]!);
                    if (grass++ < 3) console.log('grass', s.block[c], s.tint![c]!.toString(16), col.toString(16));
                }
                if (s.fluid[c]) {
                    const col = styledFluidColor(style, s.fluid[c]!, s.env?.[c] ?? null);
                    if (water++ < 3) console.log('fluid', s.fluid[c], s.env?.[c], col.toString(16));
                }
            }
        }
        console.log({ grass, water });
        expect(grass).toBeGreaterThan(0);
        await src.close();
    });
});
