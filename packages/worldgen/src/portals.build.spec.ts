// Not a test: writes `portals.json` and the instances into an existing pack, without rebuilding the rest.
//   HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_PACK_DIR=apps/site/public/gamedata/0.7.0 pnpm exec vitest run packages/worldgen/src/portals.build.spec.ts
import { describe, expect, it } from 'vitest';
import { buildPortals } from './gameData.portals';

const assets = process.env.HYCHUNK_ASSETS,
    dir = process.env.HYCHUNK_PACK_DIR;

describe.skipIf(!assets || !dir)('portal table', () => {
    it('is written', () => {
        const table = buildPortals(assets!, dir!);
        console.log(JSON.stringify(table, null, 1));
        expect(Object.keys(table.blocks).length).toBeGreaterThan(0);
    }, 600000);
});
