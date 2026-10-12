// HYCHUNK_ASSETS=/path/Assets.zip pnpm test
// Our interpreter against the values the game's own loaders produced for the same data files.
import { openZipPack } from '@hychunk/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromPath } from '../../core/src/node';
import { compileField, type JsonNode } from './noise/graph';

const assets = process.env.HYCHUNK_ASSETS;

// [file in the game's data, fixture the game's own loaders produced]
const NAMES: [string, string][] = [
    ['Mask.Continent.Blend_Inner', 'continent.Blend_Inner'], ['Mask.Continent.Blend_Outer', 'continent.Blend_Outer'],
    ['Mask.Continent.Continent_Inner', 'continent.Continent_Inner'], ['Mask.Continent.Continent_Outer', 'continent.Continent_Outer'],
    ['Mask.Temperature', 'mask.Temperature'], ['Mask.Intensity', 'mask.Intensity']
];

async function build(name: string) {
    const src = await fromPath(assets!);
    const pack = await openZipPack('Assets.zip', src);
    const files = new Map<string, JsonNode>();
    const pending = [name];
    while (pending.length) {
        const n = pending.pop()!;
        if (files.has(n)) continue;
        files.set(n, JSON.parse(new TextDecoder().decode(await pack.read(`Server/World/Default/${n.replace(/\./g, '/')}.json`))));
        for (const m of JSON.stringify(files.get(n)).matchAll(/"File":\s*"([^"]+)"/g)) pending.push(m[1]!);
    }
    await src.close();
    return compileField({ File: name }, (n) => files.get(n)!);
}

describe.skipIf(!assets)('each part of the continent graph', () => {
    for (const [name, fixture] of NAMES) {
        it(name, async () => {
            const field = await build(name);
            const truth = JSON.parse(readFileSync(new URL(`../test/fixtures/${fixture}.json`, import.meta.url), 'utf8')) as [number, number, number, number][];
            let worst = 0, bad = 0, ex = '';
            for (const [seed, x, y, want] of truth) {
                const d = Math.abs(field(seed, x, y) - want);
                worst = Math.max(worst, d);
                if (d > 1e-9) { bad++; ex ||= `(${x.toFixed(0)}, ${y.toFixed(0)}) ours ${field(seed, x, y).toFixed(5)} game ${want.toFixed(5)}`; }
            }
            console.log(`${name.padEnd(34)} differing ${String(bad).padStart(4)} of ${truth.length}, worst ${worst.toExponential(1)} ${ex}`);
        }, 60000);
    }
});

describe.skipIf(!assets)('graph interpreter matches the game', () => {
    it('Mask.Continent, 2100 points over three seeds', async () => {
        const src = await fromPath(assets!);
        try {
            const pack = await openZipPack('Assets.zip', src);
            const files = new Map<string, JsonNode>();
            const pending = ['Mask.Continent'];
            while (pending.length) {
                const n = pending.pop()!;
                if (files.has(n)) continue;
                const j = JSON.parse(new TextDecoder().decode(await pack.read(`Server/World/Default/${n.replace(/\./g, '/')}.json`)));
                files.set(n, j);
                for (const m of JSON.stringify(j).matchAll(/"File":\s*"([^"]+)"/g)) pending.push(m[1]!);
            }
            const field = compileField({ File: 'Mask.Continent' }, (n) => files.get(n)!);
            const truth = JSON.parse(readFileSync(new URL('../test/fixtures/continent.json', import.meta.url), 'utf8')) as [number, number, number, number][];
            let worst = 0, bad = 0, first = '';
            for (const [seed, x, y, want] of truth) {
                const d = Math.abs(field(seed, x, y) - want);
                worst = Math.max(worst, d);
                if (d > 1e-9) { bad++; if (!first) first = `seed ${seed} at (${x.toFixed(1)}, ${y.toFixed(1)}): ours ${field(seed, x, y)} game ${want}`; }
            }
            console.log(`points ${truth.length}, worst difference ${worst.toExponential(2)}, differing ${bad}`, first);
            expect(worst).toBeLessThan(1e-9);
        } finally {
            await src.close();
        }
    }, 120000);
});
