import { describe, expect, it } from 'vitest';
import { RegionFile, readSurface, blockColor, UNKNOWN_COLOR } from '../index';
import { blockColors } from '../data/blockColors';
import { fromPath } from '../node';

const dir = process.env.HYCHUNK_SAMPLE;
describe.skipIf(!dir)('coverage', () => {
    it('lists surface blocks without a texture', async () => {
        const src = await fromPath(`${dir}/0.0.region.bin`);
        try {
            const r = await RegionFile.open(src);
            const seen = new Map<string, number>();
            for (const slot of r.slots().slice(0, 200)) {
                const s = readSurface((await r.readChunk(slot))!);
                for (const n of s.block) seen.set(n, (seen.get(n) ?? 0) + 1);
            }
            const miss = [...seen].filter(([n]) => blockColor(n) === UNKNOWN_COLOR).sort((a, b) => b[1] - a[1]);
            const total = [...seen.values()].reduce((a, b) => a + b, 0);
            const missed = miss.reduce((a, [, v]) => a + v, 0);
            expect(missed / total).toBeLessThan(0.02);
        } finally {
            await src.close();
        }
    });
});
