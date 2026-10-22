// Not a test: writes the game's texts into an existing pack.
//   HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_PACK_DIR=apps/site/public/gamedata/0.7.0 pnpm exec vitest run packages/worldgen/src/lang.build.spec.ts
import { describe, expect, it } from 'vitest';
import { buildLang } from './gameData.lang';

const assets = process.env.HYCHUNK_ASSETS,
    dir = process.env.HYCHUNK_PACK_DIR;

describe.skipIf(!assets || !dir)('game texts', () => {
    it('are written', () => {
        const counts = buildLang(assets!, dir!);
        console.log(JSON.stringify(counts));
        expect(Object.keys(counts).length).toBeGreaterThan(0);
    }, 600000);
});
