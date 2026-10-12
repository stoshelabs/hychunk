import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { oldSimplex2, simplex2, simplex3 } from './index';

// Values the game's own classes produced for these inputs: see tools/NoiseHarness.java.
const truth = JSON.parse(readFileSync(new URL('../test/fixtures/noise.json', import.meta.url), 'utf8')) as {
    simplex2: [number, number, number, number, number][];
    simplex3: [number, number, number, number, number, number][];
    oldSimplex2: [number, number, number, number, number][];
};

describe('simplex noise matches the game', () => {
    it('2D, on 600 points from tiny to enormous coordinates', () => {
        let worst = 0;
        for (const [seed, off, x, y, want] of truth.simplex2) worst = Math.max(worst, Math.abs(simplex2(seed, off, x, y) - want));
        expect(worst).toBeLessThan(1e-12);
    });
    it('3D, on 600 points', () => {
        let worst = 0;
        for (const [seed, off, x, y, z, want] of truth.simplex3) worst = Math.max(worst, Math.abs(simplex3(seed, off, x, y, z) - want));
        expect(worst).toBeLessThan(1e-12);
    });
    it('old simplex 2D, on 600 points', () => {
        let worst = 0;
        for (const [seed, off, x, y, want] of truth.oldSimplex2) worst = Math.max(worst, Math.abs(oldSimplex2(seed, off, x, y) - want));
        expect(worst).toBeLessThan(1e-12);
    });
});
