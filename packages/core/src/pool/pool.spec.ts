import { describe, expect, it } from 'vitest';
import { doc, int32El, region } from '../testing';
import { createInlinePool } from './pool';
import type { JobHandlers, RegionSource } from './types';

const source: RegionSource = {
    kind: 'blobs',
    files: { '0.0': new Blob([region({ 0: doc(int32El('a', 41)) }) as BlobPart]) }
};

describe('inline pool', () => {
    it('runs a job with the chunk reader and returns its result', async () => {
        const handlers: JobHandlers = {
            read: async (ctx, p: { cx: number; cz: number }) => ({ result: (await ctx.chunk(p.cx, p.cz))?.a ?? null })
        };
        const pool = createInlinePool(source, handlers);
        expect(await pool.run('read', { cx: 0, cz: 0 }).promise).toBe(41);
        expect(await pool.run('read', { cx: 1, cz: 0 }).promise).toBeNull();
        expect(await pool.run('read', { cx: 99, cz: 99 }).promise).toBeNull(); // no such region
    });

    it('runs the most wanted job first and drops a cancelled one', async () => {
        const order: string[] = [];
        const pool = createInlinePool(source, {
            mark: async (_c, p: { n: string }) => ({ result: void order.push(p.n) })
        });
        const first = pool.run('mark', { n: 'first' }, 5);
        const low = pool.run('mark', { n: 'low' }, 9);
        const urgent = pool.run('mark', { n: 'urgent' }, 1);
        const dropped = pool.run('mark', { n: 'dropped' }, 2);
        dropped.cancel();
        await expect(dropped.promise).rejects.toThrow(/Cancelled/);
        await Promise.all([first.promise, low.promise, urgent.promise]);
        expect(order).toEqual(['urgent', 'first', 'low']);
    });

    it('rejects an unknown job and a destroyed pool', async () => {
        const pool = createInlinePool(source);
        await expect(pool.run('nope', {}).promise).rejects.toThrow(/No handler/);
        pool.destroy();
        await expect(pool.run('tile', { cx: 0, cz: 0 }).promise).rejects.toThrow(/destroyed/);
    });

    it('generates surface using worldGenFiles when configured', async () => {
        const pool = createInlinePool({ kind: 'blobs', files: {} });
        pool.configure('config', {
            seed: 42,
            spawn: null,
            worldGen: 'Default',
            worldGenType: 'Hytale',
            requiredPlugins: [],
            chunkStorage: 'Hytale'
        });
        pool.configure('worldGenFiles', {
            'World.json': { Masks: ['Mask.json'] },
            'Mask.json': {
                Image: '',
                Width: 1,
                Height: 1,
                Climate: {
                    Climates: [
                        {
                            Name: 'Default',
                            Color: '#3C7034',
                            Ocean: '#3C7034',
                            Shore: '#3C7034',
                            ShallowOcean: '#3C7034'
                        }
                    ]
                },
                Masks: [{ Name: 'Grassland', Color: '#3C7034' }],
                Noise: {
                    Continent: { NoiseType: 'CONSTANT', Value: 0.1, Scale: [0.001, 0.001] },
                    Temperature: { NoiseType: 'CONSTANT', Value: 0.5, Scale: [0.001, 0.001] },
                    Intensity: { NoiseType: 'CONSTANT', Value: 0.5, Scale: [0.001, 0.001] },
                    Thresholds: { Land: 0.5 }
                }
            },
            'Zones.json': {
                GridGenerator: { Type: 'Point' },
                MaskMapping: { '0x3C7034': ['Zone1'], '0x000000': ['Zone1'] }
            },
            'Zones/Zone1/Zone.json': { BiomeGenerator: { GridGenerator: { Type: 'Point' } } },
            'Zones/Zone1/Tile.Grassland.json': {
                MapColor: '#3C7034',
                TerrainHeightThreshold: { Positions: [0, 100], Values: [1, 0] },
                HeightmapNoise: { NoiseType: 'CONSTANT', Value: 0.5, Scale: [0.001, 0.001] }
            }
        });
        const surf = (await pool.run('tile', { cx: 5, cz: 5 }).promise) as any;
        expect(surf.corrupt).toBe(false);
        expect(surf.pixels).not.toBeNull();
    });
});
