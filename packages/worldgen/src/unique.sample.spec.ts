// The unique structures against the save: the temple is built of marble, so the column at its spot should be too.
//   HYCHUNK_SAVE=<world>/chunks:<seed, as in config.json>:<Server/World/Default> pnpm test
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg)('unique structures are where the save has them', () => {
    it('puts the temple on marble', async () => {
        const [dir, seedText, data] = cfg!;
        const spots = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!)))).uniquePrefabs();
        const temple = spots.find((s) => s.name === 'Temple')!;
        const cx = Math.floor(temple.x / 32), cz = Math.floor(temple.z / 32), rx = Math.floor(cx / 32), rz = Math.floor(cz / 32);
        const region = await RegionFile.open(await fromPath(`${dir}/${rx}.${rz}.region.bin`));
        const chunk = await region.readChunk((cz - rz * 32) * 32 + (cx - rx * 32));
        expect(chunk).toBeTruthy();
        const s = readSurface(chunk!);
        const near = new Set<string>();
        for (let lz = 0; lz < 32; lz++) for (let lx = 0; lx < 32; lx++) near.add(s.block[(lz << 5) | lx]!);
        console.log('temple', temple.x, temple.y, temple.z, 'blocks in its chunk:', [...near].filter((b) => /Marble|Temple/.test(b)).join(','));
        expect([...near].some((b) => /Marble/.test(b))).toBe(true);
    });
});
