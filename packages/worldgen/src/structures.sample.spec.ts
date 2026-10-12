// Structures drawn into predicted chunks against the save, in the chunks a monument reaches:
//   HYCHUNK_SAVE=<world>/chunks:<seed> pnpm test   (reads the pack in apps/site/public/gamedata/<HYCHUNK_PACK or 0.5.6>)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { RegionFile, readSurface, generatePredictedSurface, type StructureTops } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen, memorySource, makeCatalog } from './index';

const cfg = process.env.HYCHUNK_SAVE?.split(':');

describe.skipIf(!cfg || cfg.length < 2)('structures in predicted chunks', () => {
    it('match the saved chunks better than bare terrain', async () => {
        const [dir, seedText] = cfg!;
        const pack = `apps/site/public/gamedata/${process.env.HYCHUNK_PACK ?? '0.5.6'}/`;
        const gz = (n: string) => gunzipSync(readFileSync(pack + n));
        const files = JSON.parse(gz('worldgen.json.gz').toString()), table = JSON.parse(gz('prefabs.json.gz').toString());
        const meta = JSON.parse(gz('tops.json.gz').toString());
        const bin = gz('tops.bin.gz');
        const tops: StructureTops = { ...meta, data: new Int16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)) };
        const seed = Number(BigInt.asIntN(32, BigInt(seedText!)));
        const gen = loadWorldGen(memorySource(files), makeCatalog(table)).forSeed(seed);
        const decor = process.env.HYCHUNK_DECOR === '1';
        const area = decor ? 384 : 1024;
        const sites = gen.prefabSites({ minX: -area, minZ: -area, maxX: area - 1, maxZ: area - 1 }, (k) => (decor ? /^(Trees|Rock_Formations|Plants)\./ : /^Monuments\./).test(k), decor ? 8 : 0);
        const chunks = new Set<string>();
        for (const s of sites) for (let x = Math.floor((s.x + s.footprint[0]) / 32); x <= Math.floor((s.x + s.footprint[1]) / 32); x++) for (let z = Math.floor((s.z + s.footprint[2]) / 32); z <= Math.floor((s.z + s.footprint[3]) / 32); z++) chunks.add(`${x},${z}`);
        const regions = new Map<string, RegionFile | null>();
        let columns = 0, withY = 0, withBlock = 0, bareY = 0, bareBlock = 0, changed = 0, used = 0;
        for (const key of chunks) {
            const [cx, cz] = key.split(',').map(Number) as [number, number];
            const rx = Math.floor(cx / 32), rz = Math.floor(cz / 32), rk = `${rx}.${rz}`;
            if (!regions.has(rk)) { try { regions.set(rk, await RegionFile.open(await fromPath(`${dir}/${rk}.region.bin`))); } catch { regions.set(rk, null); } }
            const region = regions.get(rk);
            if (!region) continue;
            let chunk; try { chunk = await region.readChunk((cz - rz * 32) * 32 + (cx - rx * 32)); } catch { continue; }
            if (!chunk) continue;
            used++;
            const saved = readSurface(chunk);
            const withS = generatePredictedSurface(cx, cz, undefined, gen as any, tops, decor), bare = generatePredictedSurface(cx, cz, undefined, gen as any, tops, false);
            for (let c = 0; c < 1024; c++) {
                if (withS.block[c] === bare.block[c] && withS.blockY[c] === bare.blockY[c]) continue; // a column no structure touched
                changed++; columns++;
                if (withS.blockY[c] === saved.blockY[c]) withY++;
                if (withS.blockY[c] === saved.blockY[c] && withS.block[c] === saved.block[c]) withBlock++;
                if (bare.blockY[c] === saved.blockY[c]) bareY++;
                if (bare.blockY[c] === saved.blockY[c] && bare.block[c] === saved.block[c]) bareBlock++;
            }
        }
        console.log(`structures: ${used} saved chunks reached by ${sites.length} monuments; ${changed} columns changed: height right ${withY} (bare ${bareY}), height and block right ${withBlock} (bare ${bareBlock})`);
        expect(used).toBeGreaterThan(0);
    }, 300000);
});
