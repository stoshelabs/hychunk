// Compares every noise node in a folder with the values the game's own loaders gave for it
// (tools/NodeHarness.java):
//   HYCHUNK_NODES=/tmp/hn:/tmp/hn-out:/tmp/ga/Server/World/Default pnpm test
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileField, type JsonNode } from './noise/graph';

const cfg = process.env.HYCHUNK_NODES?.split(':');

/** The data has a few trailing commas; the game's JSON reader accepts them. */
const parse = (text: string) => JSON.parse(text.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'));

describe.skipIf(!cfg)('noise nodes match the game', () => {
    it('every node in the folder', () => {
        const [nodes, out, data] = cfg!;
        const load = (name: string): JsonNode => parse(readFileSync(`${data}/${name.replace(/\./g, '/')}.json`, 'utf8'));
        const bad: string[] = [];
        let count = 0, unsupported = new Map<string, number>();
        for (const f of readdirSync(nodes!).filter((n) => n.endsWith('.json')).sort()) {
            if (!existsSync(`${out}/${f}`)) continue;
            count++;
            let field;
            try {
                field = compileField(parse(readFileSync(`${nodes}/${f}`, 'utf8')), load);
            } catch (e) {
                const m = String((e as Error).message);
                unsupported.set(m, (unsupported.get(m) ?? 0) + 1);
                continue;
            }
            const truth = parse(readFileSync(`${out}/${f}`, 'utf8')) as [number, number, number, number][];
            let worst = 0;
            for (const [seed, x, y, want] of truth) worst = Math.max(worst, Math.abs(field(seed, x, y) - want));
            if (!(worst < 1e-9)) bad.push(`${f} worst ${worst.toExponential(1)}`);
        }
        console.log(`${count} nodes, ${bad.length} differ, unsupported: ${JSON.stringify([...unsupported])}`);
        if (bad.length) console.log(bad.slice(0, 15).join('\n'));
        // Known gaps (9 gully/river nodes): hexagonal cells and border measurement.
        const unexpected = [...unsupported].filter(([m]) => !/Cell type HEX|BORDER_DISTANCE/.test(m));
        expect(unexpected).toEqual([]);
        expect(bad).toEqual([]);
    }, 300000);
});
