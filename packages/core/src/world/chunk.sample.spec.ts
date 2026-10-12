// Against a real world: HYCHUNK_SAMPLE=/path/to/world/chunks pnpm test
import { describe, expect, it } from 'vitest';
import { columnOf, readSurface, RegionFile } from '../index';
import { fromPath } from '../node';

const dir = process.env.HYCHUNK_SAMPLE;

describe.skipIf(!dir)('real chunks', () => {
    it('finds a believable surface in every column', async () => {
        const src = await fromPath(`${dir}/0.0.region.bin`);
        try {
            const r = await RegionFile.open(src);
            const seen = new Map<string, number>();
            for (const slot of r.slots().slice(0, 60)) {
                const surface = readSurface((await r.readChunk(slot))!);
                for (let col = 0; col < 1024; col++) {
                    expect(surface.blockY[col]!).toBeGreaterThanOrEqual(0);
                    seen.set(surface.block[col]!, (seen.get(surface.block[col]!) ?? 0) + 1);
                }
                const c = columnOf(5, 5);
                if (surface.fluid[c])
                    console.log(
                        slot,
                        'fluid',
                        surface.fluid[c],
                        'at',
                        surface.fluidY[c],
                        'over',
                        surface.block[c],
                        surface.blockY[c]
                    );
            }
            console.log([...seen].sort((a, b) => b[1] - a[1]).slice(0, 15));
        } finally {
            await src.close();
        }
    });
});
