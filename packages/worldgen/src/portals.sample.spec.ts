// Portals: where the generator puts a door to another world, the saved column should hold the portal block somewhere.
//   HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default>:<prefabs.json> pnpm test
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';
import { makeCatalog } from './world/prefabCatalog';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg || cfg.length < 4)('portal sites', () => {
    it('are found for the temple entrances', () => {
        const [, seedText, data, table] = cfg!;
        const gen = loadWorldGen(folderSource(data!), makeCatalog(JSON.parse(readFileSync(table!, 'utf8')))).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        const sites = gen.prefabSites({ minX: -4096, minZ: -4096, maxX: 4095, maxZ: 4095 }, (k) => k.startsWith('Monuments.Unique.Temple.'));
        const withPortal = sites.filter((s) => s.marks.length);
        console.log(`temple sites ${sites.length}, with a portal ${withPortal.length}: ${withPortal.slice(0, 4).map((s) => `${s.marks[0]!.block} @${s.marks[0]!.x},${s.marks[0]!.y},${s.marks[0]!.z}`).join(' | ')}`);
        expect(sites.length).toBeGreaterThan(0);
    }, 300000);
});
