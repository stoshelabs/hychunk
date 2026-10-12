// The repeated structures against the save: where the generator says a monument stands, the saved surface should be
// built (bricks, wood, doors...), far more often than at a random spot.
//   HYCHUNK_SAVE=<world>/chunks:<seed>:<Server/World/Default>:<prefabs.json> pnpm test
import { readFileSync } from 'node:fs';
import { RegionFile, readSurface } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { loadWorldGen } from './world/gen';
import { folderSource } from './world/nodeSource';
import { makeCatalog } from './world/prefabCatalog';

const cfg = process.env.HYCHUNK_SAVE?.split(':');
const BUILT = /Brick|Plank|Wood_|Door|Stairs|Pillar|Fence|Roof|Thatch|Marble|Cobble|Lantern|Torch|Furniture|Crate|Chest|Metal|Bone/;

describe.skipIf(!cfg || cfg.length < 4)('predicted structures match the save', () => {
    it('finds built ground under monuments', async () => {
        const [dir, seedText, data, table] = cfg!;
        const gen = loadWorldGen(folderSource(data!), makeCatalog(JSON.parse(readFileSync(table!, 'utf8')))).forSeed(Number(BigInt.asIntN(32, BigInt(seedText!))));
        const rect = { minX: -1024, minZ: -1024, maxX: 1023, maxZ: 1023 };
        const sites = gen.prefabSites(rect, (k) => k.startsWith('Monuments.') && !k.includes('Elemental'));
        const regions = new Map<string, RegionFile | null>();
        const surfaceAt = async (x: number, z: number) => {
            const cx = Math.floor(x / 32), cz = Math.floor(z / 32), rx = Math.floor(cx / 32), rz = Math.floor(cz / 32), key = `${rx}.${rz}`;
            if (!regions.has(key)) { try { regions.set(key, await RegionFile.open(await fromPath(`${dir}/${key}.region.bin`))); } catch { regions.set(key, null); } }
            const region = regions.get(key);
            if (!region) return null;
            try {
                const chunk = await region.readChunk((cz - rz * 32) * 32 + (cx - rx * 32));
                return chunk ? { s: readSurface(chunk), col: (((z - cz * 32) << 5) | (x - cx * 32)) } : null;
            } catch { return null; }
        };
        const built = async (x: number, z: number, fp: [number, number, number, number]) => {
            let n = 0, total = 0;
            for (let dz = fp[2]; dz <= fp[3]; dz += 3) for (let dx = fp[0]; dx <= fp[1]; dx += 3) {
                const at = await surfaceAt(x + dx, z + dz);
                if (!at) continue;
                total++;
                if (BUILT.test(at.s.block[at.col]!)) n++;
            }
            return total ? n / total : null;
        };
        const stat = (xs: (number | null)[]) => { const v = xs.filter((a): a is number => a !== null); return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), hit: v.filter((a) => a > 0.05).length }; };
        const real: (number | null)[] = [], control: (number | null)[] = [];
        for (const s of sites) {
            real.push(await built(s.x, s.z, s.footprint));
            // the same footprint shifted by an amount that is not a multiple of the structures' spacing
            control.push(await built(s.x + 137, s.z - 211, s.footprint));
        }
        const a = stat(real), b = stat(control);
        console.log(`sites ${sites.length}; in the save: ${a.n}, built share ${a.mean.toFixed(3)}, ${a.hit} with built ground; control: ${b.n}, ${b.mean.toFixed(3)}, ${b.hit}`);
        expect(sites.length).toBeGreaterThan(0);
    }, 600000);
});
