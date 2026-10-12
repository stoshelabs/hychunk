// HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_TRUTH=/path/truth.json pnpm test
// Does the continent noise, built by our interpreter from the game's data files, say land where
// the save has land and water where it has water?
import { openZipPack } from '@hychunk/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromPath } from '../../core/src/node';
import { compileField, type JsonNode } from './noise/graph';

const assets = process.env.HYCHUNK_ASSETS;
const truthPath = process.env.HYCHUNK_TRUTH;
const WORLD_SEED = 1782738123098n;

describe.skipIf(!assets || !truthPath)('continent mask against the save', () => {
    it('predicts land and water', async () => {
        const src = await fromPath(assets!);
        try {
            const pack = await openZipPack('Assets.zip', src);
            const read = async (n: string) => JSON.parse(new TextDecoder().decode(await pack.read(`Server/World/Default/${n}`)));
            // Resolve every file the continent refers to up front (the interpreter is synchronous).
            const files = new Map<string, JsonNode>();
            const pending = ['Mask.Continent'];
            while (pending.length) {
                const n = pending.pop()!;
                if (files.has(n)) continue;
                const j = await read(`${n.replace(/\./g, '/')}.json`);
                files.set(n, j);
                for (const m of JSON.stringify(j).matchAll(/"File":\s*"([^"]+)"/g)) pending.push(m[1]!);
            }
            const continent = compileField({ File: 'Mask.Continent' }, (n) => files.get(n)!);
            const seed = Number(BigInt.asIntN(32, WORLD_SEED));

            const truth = JSON.parse(readFileSync(truthPath!, 'utf8')) as [number, number, number, number][];
            let hit = 0, n = 0, landPred = 0;
            const byRing = new Map<number, [number, number]>();
            for (const [cx, cz, water] of truth) {
                const x = cx * 32 + 16, z = cz * 32 + 16;
                const c = continent(seed, x, z);
                const predictedWater = c > 0.5;
                const actualWater = water > 0.5;
                n++;
                if (predictedWater === actualWater) hit++;
                if (!predictedWater) landPred++;
                const ring = Math.floor(Math.hypot(x, z) / 500);
                const r = byRing.get(ring) ?? [0, 0];
                r[0]++; if (predictedWater === actualWater) r[1]++;
                byRing.set(ring, r);
            }
            console.log(`chunks ${n}: land/water agreement ${(100 * hit / n).toFixed(1)}%  (always-land would give ${(100 * truth.filter((t) => t[2] <= 0.5).length / n).toFixed(1)}%)`);
            console.log('by distance from the origin:', [...byRing].sort((a, b) => a[0] - b[0]).map(([k, [t, h]]) => `${k * 500}-${k * 500 + 500}m: ${(100 * h / t).toFixed(0)}% of ${t}`).join(' | '));
            // Is there any signal in the continuous value, whatever the threshold?
            const cs = truth.map(([cx, cz]) => continent(seed, cx * 32 + 16, cz * 32 + 16));
            const ws = truth.map((t) => t[2]);
            const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
            const mc = mean(cs), mw = mean(ws);
            let cov = 0, vc = 0, vw = 0;
            for (let i = 0; i < cs.length; i++) { cov += (cs[i]! - mc) * (ws[i]! - mw); vc += (cs[i]! - mc) ** 2; vw += (ws[i]! - mw) ** 2; }
            console.log(`continent value: min ${Math.min(...cs).toFixed(3)} max ${Math.max(...cs).toFixed(3)} mean ${mc.toFixed(3)}; correlation with water share ${(cov / Math.sqrt(vc * vw)).toFixed(3)}`);
            expect(landPred).toBeGreaterThan(0);
        } finally {
            await src.close();
        }
    }, 120000);
});
