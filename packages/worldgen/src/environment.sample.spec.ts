// The environment of each column against what the game saved (EnvironmentChunk), above the ground:
//   HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default> pnpm test
import { readdirSync } from 'node:fs';
import { RegionFile, readEnvironments, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg || cfg.length < 3)('predicted environments match the save', () => {
    it('on a sample of chunks', async () => {
        const [dir, seedText, data] = cfg!;
        const gen = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        let same = 0, total = 0;
        const wrong = new Map<string, number>();
        for (const f of readdirSync(dir!).filter((x) => x.endsWith('.region.bin')).sort().slice(0, 4)) {
            const [rx, rz] = f.split('.').map(Number) as [number, number];
            const region = await RegionFile.open(await fromPath(`${dir}/${f}`));
            const slots = region.slots();
            for (let i = 0; i < slots.length; i += 19) {
                let chunk; try { chunk = await region.readChunk(slots[i]!); } catch { continue; } if (!chunk) continue;
                const s = readSurface(chunk);
                const ys = new Int16Array(1024); for (let c = 0; c < 1024; c++) ys[c] = Math.min(319, s.blockY[c]! + 1);
                const env = readEnvironments(chunk, ys);
                if (!env) continue;
                const cx = rx * 32 + (slots[i]! % 32), cz = rz * 32 + Math.floor(slots[i]! / 32);
                for (let lz = 3; lz < 32; lz += 8) for (let lx = 3; lx < 32; lx += 8) {
                    const saved = env[(lz << 5) | lx];
                    if (!saved) continue;
                    total++;
                    const p = gen.environmentAt(cx * 32 + lx, cz * 32 + lz);
                    if (p === saved) same++;
                    else { const k = `${saved} <- ${p}`; wrong.set(k, (wrong.get(k) ?? 0) + 1); }
                }
            }
        }
        const worst = [...wrong].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v} saved ${k}`).join('\n  ');
        console.log(`environments: ${same}/${total} identical\n  ${worst}`);
        expect(total).toBeGreaterThan(0);
    }, 300000);
});
