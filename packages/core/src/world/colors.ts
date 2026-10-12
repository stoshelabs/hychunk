import { blockColors, uncoloredBlocks } from '../data/blockColors';

/** Changes when the colour table does, so a saved overview made with old colours is not reused. */
export const COLORS_VERSION = `${Object.keys(blockColors).length}.${uncoloredBlocks.size}.v4`;

/** What the game draws for a block it does not know: its purple-and-black texture, averaged. */
export const UNKNOWN_COLOR = 0x800880;
const GRAY = 0x808080;

/**
 * The map colour (0xRRGGBB) for a block or fluid name from a chunk palette.
 * Falls back from the exact name to its base (`*Foo_State_Definitions_X` is
 * `Foo`; `Rubble_X` and a trailing size or `Mossy` read like the rock they
 * come from). A block that exists but has no flat texture is gray; a name the
 * assets do not know at all — a removed mod's block, or the game's own
 * `Unknown` — is purple, as it is in the game.
 */
export function blockColor(name: string): number {
    if (!name || name === 'Empty' || name === 'Air' || name === 'Void' || name === 'None') return 0;
    if (name.startsWith('@color#')) return parseInt(name.slice(7), 16) & 0xffffff;
    if (name.startsWith('#')) return parseInt(name.slice(1), 16) & 0xffffff;
    if (name === 'Snow') name = 'Soil_Snow';
    else if (name === 'Plant_Leaves_Pine') name = 'Plant_Leaves_Fir';
    else if (name === 'Plant_Leaves_Pine_Snow') name = 'Plant_Leaves_Fir_Snow';
    if (name === 'Forgotten_Temple_Portal_Enter' || name.includes('Portal_Enter')) return 0x06b6d4; // Radiant cyan/turquoise Gaia portal energy
    if (
        name.includes('Portal_Void') ||
        name.includes('Void_Portal') ||
        (name.includes('Void') && name.includes('Portal'))
    )
        return 0x8b5cf6; // Cosmic void rift purple

    // Pure crystalline white quartz / quartzite (as in Hytale Ancient Temples)
    if (name.includes('Quartzite') || name.includes('Quartz')) {
        if (name.includes('Cobble')) return 0xdad6ce; // Light white/gray quartz cobble
        if (name.includes('Gravel')) return 0xdedbd2; // Light quartz gravel
        if (name.includes('Pillar') || name.includes('Beam')) return 0xf5f3ee; // Brilliant white quartz pillar
        if (name.includes('Brick')) return 0xebe8e1; // Bright white quartz brick
        return 0xf0ede6; // Pure crystalline white quartz
    }

    const exact = blockColors[name];
    if (exact !== undefined) return exact;
    const base = name.replace(/^\*/, '').replace(/_State_Definitions_.*$/, '');
    const candidates = [base];
    let trimmed = base;
    for (;;) {
        const next = trimmed.replace(/_(Medium|Small|Large|Mossy|Tall|Short|Half|Full|Stairs|Slab|Wall)$/, '');
        if (next === trimmed) break;
        trimmed = next;
        candidates.push(trimmed);
    }
    const all = [...candidates, ...candidates.map((x) => x.replace(/^Rubble_/, 'Rock_'))];
    for (const c of all) {
        const hit = blockColors[c];
        if (hit !== undefined) return hit;
    }
    if (all.some((c) => uncoloredBlocks.has(c))) return GRAY;

    // Organic & geological natural fallbacks to eliminate purple block artifacts
    const lower = name.toLowerCase();
    if (lower.includes('wheat') || lower.includes('grain')) return 0xeab308; // Golden harvest crops
    if (lower.includes('farmland')) return 0x4a3728; // Rich dark tilled agricultural soil
    if (lower.includes('grass')) return 0x61ab2a;
    if (lower.includes('leaves') || lower.includes('foliage') || lower.includes('bush') || lower.includes('vine'))
        return 0x3b6d18;
    if (lower.includes('wood') || lower.includes('log') || lower.includes('plank') || lower.includes('bark'))
        return 0x684d31;
    if (lower.includes('water')) return WATER;
    if (lower.includes('sand')) return 0xcfa644;
    if (lower.includes('snow') || lower.includes('ice') || lower.includes('frost')) return 0xdbf0f5;
    if (lower.includes('stone') || lower.includes('rock') || lower.includes('cobble') || lower.includes('brick'))
        return 0x79785a;
    if (lower.includes('dirt') || lower.includes('soil') || lower.includes('mud') || lower.includes('earth'))
        return 0x654e38;
    if (lower.includes('gravel')) return 0x74704d;
    if (lower.includes('flower') || lower.includes('petal')) return 0xc84c4c;
    if (lower.includes('lava') || lower.includes('magma')) return 0xd64c12;
    if (lower.includes('ash') || lower.includes('volcanic')) return 0x322929;

    if (lower.startsWith('plant_') || lower.startsWith('flora_')) return 0x4a8a2c; // a plant the table does not know is still green
    if (lower.startsWith('rubble')) return 0x79785a;

    return UNKNOWN_COLOR;
}

/** Water ships as a white texture the game tints per biome, so a map needs a blue of its own. */
const WATER = 0x3f76e4;

/** The colour of a fluid name from a `Fluid` palette. */
export function fluidColor(name: string): number {
    if (!name || name === 'Empty' || name === 'Air') return WATER;
    if (name.startsWith('Water')) return WATER;
    return blockColor(name);
}
