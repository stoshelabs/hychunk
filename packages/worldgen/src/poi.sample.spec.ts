// The map's structure markers from the real generator: squares fill in one by one, nearest the view first.
//   HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default>:<prefabs.json> pnpm test
import { readFileSync } from 'node:fs';
import { PoiGenerator, type StructureSource } from '@hychunk/core';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';
import { makeCatalog } from './world/prefabCatalog';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg || cfg.length < 4)('structure markers', () => {
    it('fill in as squares are worked out', async () => {
        const [, seedText, data, table] = cfg!;
        const seed = Number(BigInt.asIntN(32, BigInt(seedText!)));
        const gen = loadWorldGen(folderSource(data!), makeCatalog(JSON.parse(readFileSync(table!, 'utf8')))).forSeed(seed);
        let updates = 0;
        const source: StructureSource = {
            unique: async () => gen.uniquePrefabs(),
            square: async (x, z, size) => gen.prefabSites({ minX: x, minZ: z, maxX: x + size - 1, maxZ: z + size - 1 }, (k) => /^(Monuments|Npc)\./.test(k)),
            dispose: () => {}
        };
        const poi = new PoiGenerator(seed, source, () => { updates++; });
        const rect = [-768, -768, 767, 767] as const;
        poi.getMarkersInRect(...rect);
        const t0 = Date.now();
        while (updates < 10 && Date.now() - t0 < 120000) { poi.getMarkersInRect(...rect); await new Promise((r) => setTimeout(r, 50)); }
        const first = poi.getMarkersInRect(...rect).filter((m) => !m.category);
        expect(first.map((m) => m.name)).toEqual(expect.arrayContaining(['Spawn', 'Temple']));
        const all = poi.getMarkersInRect(...rect);
        const cats = new Map<string, number>();
        for (const m of all) cats.set(m.category ?? 'guess', (cats.get(m.category ?? 'guess') ?? 0) + 1);
        console.log(`${updates} squares in ${Date.now() - t0} ms; markers: ${[...cats].map(([k, v]) => `${k} ${v}`).join(', ')}; e.g. ${all.filter((m) => m.category).slice(0, 3).map((m) => `${m.name} @${m.x},${m.z}`).join(' | ')}`);
        expect(all.length).toBeGreaterThan(first.length);
        expect(all.some((m) => m.category)).toBe(true);
        poi.dispose();
    }, 180000);
});
