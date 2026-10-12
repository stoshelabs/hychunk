import { describe, expect, it } from 'vitest';
import { renderChunkPixels } from './render';
import type { ChunkSurface } from './chunk';

const surface = (over: Partial<ChunkSurface> = {}): ChunkSurface => ({
    block: new Array(1024).fill('Rock_Stone'),
    blockY: new Int16Array(1024).fill(50),
    fluid: new Array(1024).fill(null),
    fluidY: new Int16Array(1024).fill(-1),
    ...over
});

describe('renderChunkPixels', () => {
    it('draws flat ground opaque and hollow columns transparent', () => {
        const blockY = new Int16Array(1024).fill(50);
        blockY[0] = -1;
        const px = renderChunkPixels(surface({ blockY }));
        expect(px[3]).toBe(0);
        expect(px[7]).toBe(255);
    });
    it('hides a fluid that lies below the top block and tints one above it', () => {
        const fluid = new Array<string | null>(1024).fill('Water_Source');
        const under = renderChunkPixels(surface({ fluid, fluidY: new Int16Array(1024).fill(10) }));
        const plain = renderChunkPixels(surface());
        expect([...under.subarray(0, 4)]).toEqual([...plain.subarray(0, 4)]);
        const over = renderChunkPixels(surface({ fluid, fluidY: new Int16Array(1024).fill(52) }));
        expect(over[2]!).toBeGreaterThan(plain[2]!);
    });
});
