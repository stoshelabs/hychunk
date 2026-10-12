// Cave entries from the real generator, dungeon-like types only.
//   HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default> pnpm test
import { DUNGEON_CAVES } from '@hychunk/core';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg || cfg.length < 3)('cave entries', () => {
    it('are found for the dungeon-like types', () => {
        const [, seedText, data] = cfg!;
        const gen = loadWorldGen(folderSource(data!)).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        const t0 = Date.now();
        const entries = gen.caveEntries({ minX: -4096, minZ: -4096, maxX: 4095, maxZ: 4095 }, (n) => DUNGEON_CAVES.test(n));
        const by = new Map<string, number>();
        for (const e of entries) by.set(e.type, (by.get(e.type) ?? 0) + 1);
        console.log(`cave entries in 8192 x 8192: ${entries.length} in ${Date.now() - t0} ms; ${[...by].map(([k, v]) => `${k} ${v}`).join(', ')}`);
        expect(entries.length).toBeGreaterThan(0);
    }, 300000);
});
