// Not a test: writes the extent of every prefab of an Assets.zip (see world/prefabCatalog.ts).
//   HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_PREFAB_TABLE=out.json pnpm exec vitest run packages/worldgen/src/prefabTable.build.spec.ts
import { writeFileSync } from 'node:fs';
import { openZipPack } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { buildPrefabTable } from './world/prefabCatalog';

const assets = process.env.HYCHUNK_ASSETS, out = process.env.HYCHUNK_PREFAB_TABLE;

describe.skipIf(!assets || !out)('prefab table', () => {
    it('is written', async () => {
        const pack = await openZipPack('Assets.zip', await fromPath(assets!));
        const table = await buildPrefabTable(pack as any);
        writeFileSync(out!, JSON.stringify(table));
        console.log(`${Object.keys(table.prefabs).length} prefabs written to ${out}`);
        expect(Object.keys(table.prefabs).length).toBeGreaterThan(1000);
    }, 600000);
});
