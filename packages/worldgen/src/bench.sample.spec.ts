// How long a dense chunk takes: HYCHUNK_BENCH=<Server/World/Default>:<seed> pnpm test
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_BENCH?.split(':');
describe.skipIf(!cfg)('chunk cost', () => {
    it('times chunks', () => {
        const t0 = performance.now();
        const world = loadWorldGen(folderSource(cfg![0]!));
        const gen = world.forSeed(Number(BigInt.asIntN(32, BigInt(cfg![1]!))));
        const tLoad = performance.now() - t0;
        const out: string[] = [`load ${tLoad.toFixed(0)} ms`];
        for (const [cx, cz] of [[0, 0], [1, 0], [40, 40], [-30, 12]] as [number, number][]) {
            const a = performance.now();
            let sum = 0;
            for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) sum += gen.heightAt(cx * 32 + x, cz * 32 + z);
            const b = performance.now();
            for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) sum += gen.zoneBiomeAt(cx * 32 + x, cz * 32 + z).biome.mapColor;
            out.push(`chunk ${cx},${cz}: heights ${(b - a).toFixed(0)} ms, biomes again ${(performance.now() - b).toFixed(0)} ms (${sum})`);
        }
        writeFileSync('/tmp/bench-report.txt', out.join('\n') + '\n');
    }, 600000);
});
