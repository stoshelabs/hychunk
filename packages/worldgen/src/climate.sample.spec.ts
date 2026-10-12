// The climate mask against the game's own loader (tools/ClimateHarness.java):
//   HYCHUNK_CLIMATE=/tmp/climate.json:/tmp/ga/Server/World/Default pnpm test
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { JsonNode } from './noise/graph';
import { loadClimateMask } from './world/climate';

const cfg = process.env.HYCHUNK_CLIMATE?.split(':');
const parse = (text: string) => JSON.parse(text.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'));

describe.skipIf(!cfg)('climate mask matches the game', () => {
    const [truthFile, data] = cfg ?? [];
    const load = (name: string): JsonNode => parse(readFileSync(`${data}/${name.replace(/\./g, '/')}.json`, 'utf8'));
    const truth = cfg ? (JSON.parse(readFileSync(truthFile!, 'utf8').replace(/NaN/g, 'null')) as { seed: number; uniques: number[][]; samples: number[][] }[]) : [];

    for (const t of truth) {
        it(`seed ${t.seed}`, () => {
            const mask = loadClimateMask(load('Mask'), load).forSeed(t.seed);
            expect(mask.uniques.map((u) => [u.color, u.radius, u.x, u.y])).toEqual(t.uniques);
            let colors = 0, fades = 0, warp = 0;
            const ex: string[] = [];
            for (const [x, z, rx, rz, color, fade] of t.samples as [number, number, number, number, number, number | null][]) {
                const [wx, wz] = mask.warp(t.seed, x, z);
                if (Math.abs(wx - rx) > 1e-9 || Math.abs(wz - rz) > 1e-9) warp++;
                const got = mask.at(t.seed, rx, rz);
                if (got.color !== color) { colors++; if (ex.length < 5) ex.push(`(${x},${z}) colour ${got.color.toString(16)} want ${color.toString(16)}`); }
                if (fade !== null && Math.abs(got.fade - fade) > 1e-9) fades++;
            }
            if (colors || fades || warp) console.log(`seed ${t.seed}: ${warp} warps, ${colors} colours, ${fades} fades differ`, ex);
            expect([warp, colors, fades]).toEqual([0, 0, 0]);
        }, 120000);
    }
});
