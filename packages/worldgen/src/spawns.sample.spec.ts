// The spawn table of an Assets.zip, and what it says about the environments the generator makes.
//   HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default> pnpm test
import { openZipPack } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';
import { buildSpawnTable, makeSpawns } from './world/spawns';

const assets = process.env.HYCHUNK_ASSETS, cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!assets || !cfg || cfg.length < 3)('spawns', () => {
    it('cover the environments the biomes produce', async () => {
        const pack = await openZipPack('Assets.zip', await fromPath(assets!));
        const table = await buildSpawnTable(pack as any);
        const spawns = makeSpawns(table);
        const wg = loadWorldGen(folderSource(cfg![2]!));
        const used = new Set<string>();
        for (const z of wg.zones) for (const b of [...z.tiles, ...z.customs]) {
            const e = b.json.Environment;
            for (const n of ([] as string[]).concat(e?.Default?.Names ?? e?.Default ?? [])) used.add(String(n));
        }
        const covered = [...used].filter((e) => spawns.mobsIn(e).length);
        console.log(`${table.groups.length} spawn tables, ${spawns.mobs().length} mobs, ${Object.keys(table.markers).length} markers; ${covered.length} of ${used.size} biome environments have spawns; plains: ${spawns.mobsIn('Env_Zone1_Plains').slice(0, 5).map((m) => `${m.id} ${m.share}%`).join(', ')}`);
        expect(spawns.mobs().length).toBeGreaterThan(50);
        expect(spawns.mobsIn('Env_Zone1_Plains').length).toBeGreaterThan(0);
    }, 120000);
});
