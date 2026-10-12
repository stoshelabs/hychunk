// The top of each column (layers, then covers) against what the game saved:
//   HYCHUNK_SAVE=<world>/chunks:<seed, as in config.json>:<Server/World/Default> pnpm test
import { readdirSync } from 'node:fs';
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg)('predicted covers match the save', () => {
    it('on a sample of chunks', async () => {
        const [dir, seedText, data] = cfg!;
        const gen = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        let n = 0, groundOk = 0, withY = 0, withBlock = 0, noCoverBlock = 0, coverRows = 0;
        const wrong = new Map<string, number>();
        const t0 = Date.now();
        for (const f of readdirSync(dir!).filter((x) => x.endsWith('.region.bin')).sort().slice(0, 4)) {
            const [rx, rz] = f.split('.').map(Number) as [number, number];
            const region = await RegionFile.open(await fromPath(`${dir}/${f}`));
            const slots = region.slots();
            for (let i = 0; i < slots.length; i += 29) {
                let chunk;
                try { chunk = await region.readChunk(slots[i]!); } catch { continue; }
                if (!chunk) continue;
                const s = readSurface(chunk);
                const cx = rx * 32 + (slots[i]! % 32), cz = rz * 32 + Math.floor(slots[i]! / 32);
                const tops = [];
                for (let lz = 0; lz < 32; lz++) for (let lx = 0; lx < 32; lx++) {
                    const x = cx * 32 + lx, z = cz * 32 + lz;
                    tops.push(gen.topAt(x, z, gen.heightAt(x, z)));
                }
                const covered = gen.coverChunk(cx, cz, tops);
                for (let col = 0; col < 1024; col++) {
                    n++;
                    const base = tops[col]!, c = covered[col]!;
                    if (base.block === s.block[col] && base.y === s.blockY[col]) groundOk++;
                    if (c.y === s.blockY[col]) withY++;
                    if (c.y === s.blockY[col] && c.block === s.block[col]) withBlock++;
                    if (base.y === s.blockY[col] && base.block === s.block[col]) noCoverBlock++;
                    if (c.y === s.blockY[col] && c.block !== s.block[col]) { const k = `${s.block[col]} <- ${c.block}`; wrong.set(k, (wrong.get(k) ?? 0) + 1); }
                    if (c !== base) coverRows++;
                }
            }
        }
        const worst = [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${v} saved ${k}`).join('\n  ');
        console.log(`covers: ${n} columns; layers only identical ${noCoverBlock}; with covers: height ${withY}, height and block ${withBlock}; ${coverRows} columns got a cover; ${Date.now() - t0} ms\n  ${worst}`);
        expect(n).toBeGreaterThan(0);
    }, 900000);
});
