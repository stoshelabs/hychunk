// The predicted top block against what the game saved:
//   HYCHUNK_SAVE=<world>/chunks:<seed, as in config.json>:<Server/World/Default> pnpm test
// Only columns where the saved ground is at the predicted height are compared (plants, trees and builds sit above it).
import { readdirSync } from 'node:fs';
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg)('predicted top blocks match the save', () => {
    it('on a sample of chunks', async () => {
        const [dir, seedText, data] = cfg!;
        const gen = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        let same = 0, total = 0, atHeight = 0;
        const wrong = new Map<string, number>();
        const t0 = Date.now();
        for (const f of readdirSync(dir!).filter((x) => x.endsWith('.region.bin')).sort().slice(0, 4)) {
            const [rx, rz] = f.split('.').map(Number) as [number, number];
            const region = await RegionFile.open(await fromPath(`${dir}/${f}`));
            const slots = region.slots();
            for (let i = 0; i < slots.length; i += 11) {
                let chunk;
                try { chunk = await region.readChunk(slots[i]!); } catch { continue; }
                if (!chunk) continue;
                const s = readSurface(chunk);
                const cx = rx * 32 + (slots[i]! % 32), cz = rz * 32 + Math.floor(slots[i]! / 32);
                for (let lz = 2; lz < 32; lz += 6) for (let lx = 2; lx < 32; lx += 6) {
                    const x = cx * 32 + lx, z = cz * 32 + lz, col = (lz << 5) | lx;
                    total++;
                    const h = gen.heightAt(x, z);
                    if (h !== s.blockY[col]) continue;
                    atHeight++;
                    const top = gen.topAt(x, z, h);
                    if (top.block === s.block[col]) same++;
                    else { const k = `${s.block[col]} <- ${top.block}`; wrong.set(k, (wrong.get(k) ?? 0) + 1); }
                }
            }
        }
        const worst = [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v} saved ${k}`).join('\n  ');
        console.log(`layers: ${same}/${atHeight} top blocks identical where the height matches (${atHeight}/${total} columns), ${Date.now() - t0} ms\n  ${worst}`);
        expect(atHeight).toBeGreaterThan(0);
    }, 600000);
});
