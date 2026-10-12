// The 2 GB region: HYCHUNK_SAMPLE=/path/to/world/chunks pnpm test
import { describe, expect, it } from 'vitest';
import { CorruptChunkError, RegionFile, readSurface } from './index';
import { fromPath } from './node';

const dir = process.env.HYCHUNK_SAMPLE;

describe.skipIf(!dir)('large region', () => {
    it('reads a multi-gigabyte region, reporting damaged slots as such', async () => {
        const src = await fromPath(`${dir}/-1.0.region.bin`);
        try {
            const r = await RegionFile.open(src);
            let ok = 0,
                corrupt = 0;
            for (const slot of r.slots()) {
                try {
                    expect(readSurface((await r.readChunk(slot))!).blockY[0]).toBeGreaterThanOrEqual(-1);
                    ok++;
                } catch (e) {
                    if (!(e instanceof CorruptChunkError)) throw e;
                    corrupt++;
                }
            }
            console.log('readable', ok, 'corrupt', corrupt);
            expect(ok).toBeGreaterThan(corrupt * 10);
        } finally {
            await src.close();
        }
    }, 120_000);
});
