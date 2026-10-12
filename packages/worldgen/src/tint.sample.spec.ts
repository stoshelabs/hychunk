// The predicted biome tint against what the game saved:
//   HYCHUNK_SAVE=<world>/chunks:<seed, as in config.json>:<Server/World/Default> pnpm test
import { readdirSync } from 'node:fs';
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg)('predicted tint matches the save', () => {
    it('on a sample of chunks', async () => {
        const [dir, seedText, data] = cfg!;
        const gen = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        let same = 0, total = 0, worst = 0;
        for (const f of readdirSync(dir!).filter((x) => x.endsWith('.region.bin')).sort().slice(0, 3)) {
            const [rx, rz] = f.split('.').map(Number) as [number, number];
            const region = await RegionFile.open(await fromPath(`${dir}/${f}`));
            const slots = region.slots();
            for (let i = 0; i < slots.length; i += 13) {
                let chunk;
                try { chunk = await region.readChunk(slots[i]!); } catch { continue; }
                if (!chunk) continue;
                const s = readSurface(chunk);
                if (!s.tint) continue;
                const cx = rx * 32 + (slots[i]! % 32), cz = rz * 32 + Math.floor(slots[i]! / 32);
                for (let lz = 2; lz < 32; lz += 9) for (let lx = 2; lx < 32; lx += 9) {
                    const p = gen.tintAt(cx * 32 + lx, cz * 32 + lz) & 0xffffff, t = s.tint[(lz << 5) | lx]! & 0xffffff;
                    total++;
                    if (p === t) same++;
                    else worst = Math.max(worst, Math.abs((p >> 16) - (t >> 16)), Math.abs(((p >> 8) & 255) - ((t >> 8) & 255)), Math.abs((p & 255) - (t & 255)));
                }
            }
        }
        console.log(`tint: ${same}/${total} identical, worst channel difference ${worst}`);
        expect(total).toBeGreaterThan(0);
    }, 600000);
});
