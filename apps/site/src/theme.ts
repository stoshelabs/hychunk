import { Prism, definePreset, updatePrimaryPalette, updateSurfacePalette } from '@vitral/themes';

/**
 * The site's look on Vitral's tokens: Prism underneath, the amber of Hytale's own interface as the primary colour, and
 * cool dark slate surfaces (the navy of the game's menus), always dark.
 */
export const HyChunkTheme = updateSurfacePalette(updatePrimaryPalette(definePreset(Prism, {}), '#f5a524'), {
    dark: '#64748b'
});
