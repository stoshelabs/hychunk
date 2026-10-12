import { describe, expect, it } from 'vitest';
import { generatePredictedSurface } from './predict';
import { renderChunkPixels } from './render';

describe('generatePredictedSurface', () => {
    const mockGen = {
        heightAt: () => 64,
        waterAt: () => null,
        zoneBiomeAt: () => ({ biome: { mapColor: 0x3c7034, name: 'Grassland' } })
    };

    it('generates a valid 32x32 surface with 1024 columns when gen is provided', () => {
        const s = generatePredictedSurface(
            0,
            0,
            {
                seed: 12345,
                spawn: null,
                worldGen: 'Default',
                worldGenType: 'Hytale',
                requiredPlugins: [],
                chunkStorage: 'Hytale'
            },
            mockGen
        );
        expect(s.block.length).toBe(1024);
        expect(s.blockY.length).toBe(1024);
        expect(s.fluid.length).toBe(1024);
        expect(s.fluidY.length).toBe(1024);

        for (let i = 0; i < 1024; i++) {
            expect(s.blockY[i]).toBe(64);
            expect(typeof s.block[i]).toBe('string');
        }
    });

    it('can be rendered to RGBA pixels with renderChunkPixels', () => {
        const s = generatePredictedSurface(
            10,
            -5,
            {
                seed: 42,
                spawn: null,
                worldGen: 'Default',
                worldGenType: 'Hytale',
                requiredPlugins: [],
                chunkStorage: 'Hytale'
            },
            mockGen
        );
        const pixels = renderChunkPixels(s);
        expect(pixels.length).toBe(32 * 32 * 4);
        expect(pixels[3]).toBe(255);
    });

    it('returns empty surface when gen is not provided', () => {
        const s = generatePredictedSurface(0, 0, {
            seed: 12345,
            spawn: null,
            worldGen: 'Default',
            worldGenType: 'Hytale',
            requiredPlugins: [],
            chunkStorage: 'Hytale'
        });
        expect(s.block[0]).toBe('Empty');
        expect(s.blockY[0]).toBe(-1);
    });

    it('generates Flat surface when worldGenType is Flat', () => {
        const s = generatePredictedSurface(0, 0, {
            seed: 0,
            spawn: null,
            worldGen: null,
            worldGenType: 'Flat',
            requiredPlugins: [],
            chunkStorage: 'Hytale'
        });
        expect(s.block[0]).toBe('Soil_Grass');
        expect(s.blockY[0]).toBe(64);
        expect(s.fluid[0]).toBeNull();
    });

    it('generates Void surface when worldGenType is Void', () => {
        const s = generatePredictedSurface(0, 0, {
            seed: 0,
            spawn: null,
            worldGen: null,
            worldGenType: 'Void',
            requiredPlugins: [],
            chunkStorage: 'Hytale'
        });
        expect(s.block[0]).toBe('Empty');
        expect(s.blockY[0]).toBe(-1);
        expect(s.fluid[0]).toBeNull();
    });

    it('does not draw structures that the generator has not been ported for', () => {
        const withUnique = { ...mockGen, uniques: [{ zone: 'Zone1_Spawn', x: 0, y: 0, radius: 35 }] };
        const s = generatePredictedSurface(
            0,
            0,
            {
                seed: 1,
                spawn: null,
                worldGen: 'Default',
                worldGenType: 'Hytale',
                requiredPlugins: [],
                chunkStorage: 'Hytale'
            },
            withUnique
        );
        for (let i = 0; i < 1024; i++) expect(s.blockY[i]).toBe(64);
    });
});
