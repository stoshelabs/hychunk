import { describe, expect, it } from 'vitest';
import { blockColor, fluidColor, UNKNOWN_COLOR } from './colors';

describe('blockColor', () => {
    it('uses the exact name, then the base, then gray for blocks without a texture', () => {
        expect(blockColor('Soil_Grass')).not.toBe(0x808080);
        expect(blockColor('Rubble_Stone_Medium')).toBe(blockColor('Rock_Stone'));
        expect(blockColor('*Rock_Stone_State_Definitions_Corner')).toBe(blockColor('Rock_Stone'));
        expect(blockColor('*Plant_Crop_Wheat_Block_State_Definitions_Stage3')).toBe(0x808080);
        expect(blockColor('Furniture_Crude_Torch')).toBe(0x808080);
    });

    it('gives water a blue of its own', () => {
        expect(fluidColor('Water_Source')).toBe(0x3f76e4);
        expect(fluidColor('Lava_Source')).toBe(blockColor('Lava_Source'));
    });

    it('draws a name the assets do not know as the game does: purple', () => {
        expect(blockColor('Unknown')).toBe(UNKNOWN_COLOR);
        expect(blockColor('Some_Mod_Block')).toBe(UNKNOWN_COLOR);
        expect(UNKNOWN_COLOR).toBe(0x800880);
    });
});
