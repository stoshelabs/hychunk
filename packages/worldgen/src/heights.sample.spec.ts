// The predicted column heights against what the game saved:
//   HYCHUNK_SAVE=<world>/chunks:<seed, as in config.json>:<Server/World/Default> pnpm test
// A saved top block is the terrain's height, or one more (a plant), or a tree or a structure above it,
// or a change by a player, so the share that matches is reported rather than demanded to be 100 %.
import { readdirSync, writeFileSync } from 'node:fs';
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg)('predicted heights match the save', () => {
    it('on a sample of chunks', async () => {
        const [dir, seedText, data] = cfg!;
        const seed = Number(BigInt.asIntN(32, BigInt(seedText!)));
        const gen = loadWorldGen(folderSource(data!)).forSeed(seed);
        const hist = new Map<number, number>();
        const missed: string[] = [];
        const water = { both: 0, sameTop: 0, onlySaved: 0, onlyPredicted: 0, neither: 0 };
        let n = 0;
        const rows: string[] = [];
        for (const f of readdirSync(dir!).filter((x) => x.endsWith('.region.bin')).sort()) {
            const [rx, rz] = f.split('.').map(Number) as [number, number];
            const src = await fromPath(`${dir}/${f}`);
            const region = await RegionFile.open(src);
            const slots = region.slots();
            // every 7th chunk of the region, a few columns of each
            for (let i = 0; i < slots.length; i += 7) {
                const slot = slots[i]!;
                let chunk;
                try { chunk = await region.readChunk(slot); } catch { continue; } // a damaged chunk
                if (!chunk) continue;
                const s = readSurface(chunk);
                const cx = rx * 32 + (slot % 32), cz = rz * 32 + Math.floor(slot / 32);
                let match = 0, total = 0;
                for (let lz = 3; lz < 32; lz += 8) {
                    for (let lx = 3; lx < 32; lx += 8) {
                        const saved = s.blockY[(lz << 5) | lx]!;
                        if (saved < 0) continue;
                        const predicted = gen.heightAt(cx * 32 + lx, cz * 32 + lz);
                        const savedWater = s.fluidY[(lz << 5) | lx]!;
                        const wa = gen.waterAt(cx * 32 + lx, cz * 32 + lz);
                        const predWater = wa && predicted < wa.y ? wa.y : -1;
                        if (savedWater >= 0 && predWater >= 0) { water.both++; if (savedWater === predWater) water.sameTop++; }
                        else if (savedWater >= 0) { water.onlySaved++; if (missed.length < 400) missed.push(`${gen.zoneBiomeAt(cx * 32 + lx, cz * 32 + lz).biome.name} saved water ${savedWater} (${s.fluid[(lz << 5) | lx]}) top ${saved} predicted height ${predicted} water ${wa ? wa.y : 'none'}`); }
                        else if (predWater >= 0) water.onlyPredicted++;
                        else water.neither++;
                        const d = saved - predicted;
                        hist.set(d, (hist.get(d) ?? 0) + 1);
                        total++; n++;
                        if (d === 0 || d === 1) match++;
                    }
                }
                if (total && rows.length < 12) rows.push(`chunk ${cx},${cz}: ${match}/${total} within 0..1 of the saved top (${gen.zoneBiomeAt(cx * 32 + 16, cz * 32 + 16).biome.name})`);
            }
            await src.close();
        }
        const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
        console.log(`${n} columns. saved - predicted, most common: ${sorted.map(([d, c]) => `${d}:${c}`).join('  ')}`);
        console.log(rows.join('\n'));
        writeFileSync('/tmp/missed-water.txt', missed.join('\n'));
        writeFileSync('/tmp/heights-report.txt', `water ${JSON.stringify(water)}\n${n} columns. saved - predicted, most common: ${sorted.map(([d, c]) => `${d}:${c}`).join('  ')}\n${rows.join('\n')}\n`);
        expect(n).toBeGreaterThan(0);
    }, 600000);
});
