// Each case is a tiny graph in test/data, with the values the game's own loaders gave for it.
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { compileField, type JsonNode } from './noise/graph';

const dir = new URL('../test/data/', import.meta.url);
const load = (n: string): JsonNode => JSON.parse(readFileSync(new URL(`${n}.json`, dir), 'utf8'));
const CASES = ['t_leaf', 't_scale', 't_fractal', 't_norm', 't_point', 't_unseeded', 't_dist', 't_dist_oct', 't_sum', 't_blend'];

describe('graph parts against the game', () => {
    for (const name of CASES) {
        it(name, () => {
            const field = compileField({ File: name }, load);
            const truth = JSON.parse(readFileSync(new URL(`../test/fixtures/parts.${name}.json`, import.meta.url), 'utf8')) as [number, number, number, number][];
            let worst = 0, bad = 0, ex = '';
            for (const [seed, x, y, want] of truth) {
                const got = field(seed, x, y), d = Math.abs(got - want);
                worst = Math.max(worst, d);
                if (d > 1e-9) { bad++; ex ||= `(${x.toFixed(0)}, ${y.toFixed(0)}) ours ${got.toFixed(5)} game ${want.toFixed(5)}`; }
            }
            console.log(`${name.padEnd(12)} ${bad === 0 ? 'MATCHES' : 'DIFFERS '} ${String(bad).padStart(4)} of ${truth.length}  worst ${worst.toExponential(1)}  ${ex}`);
        });
    }
});
