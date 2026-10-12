// Integration check against a real world: HYCHUNK_SAMPLE=/path/to/world/chunks pnpm test
import { describe, expect, it } from 'vitest';
import { RegionFile, slotOf } from './index';
import { fromPath } from './node';

const dir = process.env.HYCHUNK_SAMPLE;

describe.skipIf(!dir)('real world', () => {
    it('reads every chunk of a region', async () => {
        const src = await fromPath(`${dir}/-1.-2.region.bin`);
        const r = await RegionFile.open(src);
        const slots = r.slots();
        expect(slots.length).toBeGreaterThan(0);
        for (const s of slots) expect(await r.readChunk(s)).toHaveProperty('Components');
        await src.close();
    });

    it('fills regions as a disc around the origin, x along the slot', async () => {
        // Region 0.-1 lies at x ≥ 0, z < 0: its empty corner is the one far from the origin,
        // x = 31 and z = 0 — slot 31.
        const src = await fromPath(`${dir}/0.-1.region.bin`);
        const r = await RegionFile.open(src);
        expect(r.has(slotOf(31, 0))).toBe(false);
        expect(r.has(slotOf(0, 31))).toBe(true);
        await src.close();
    });
});
