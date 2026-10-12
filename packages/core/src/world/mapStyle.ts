import type { BlockTable } from '../packs/blocks';

/**
 * What the game's own map needs to colour a column, taken from the person's game files:
 * per block `[tintUp, biomeTintUp, particleColor]`, per fluid `[particleColor, isWater]`
 * (-1 where the file has none) and the water tint of each environment.
 */
export interface MapStyle {
    blocks: Record<string, [number, number, number]>;
    fluids: Record<string, [number, number]>;
    waterTint: Record<string, number>;
}

export function toMapStyle(table: BlockTable): MapStyle {
    const blocks: MapStyle['blocks'] = {};
    for (const [id, b] of Object.entries(table.blocks))
        blocks[id] = [b.tintUp ?? -1, b.biomeTint ?? 0, b.particle ?? -1];
    const fluids: MapStyle['fluids'] = {};
    for (const [id, f] of Object.entries(table.fluids)) fluids[id] = [f.particle ?? -1, f.water ? 1 : 0];
    return { blocks, fluids, waterTint: { ...table.environments } };
}

const baseOf = (name: string) => name.replace(/^\*/, '').replace(/_State_Definitions_.*$/, '');

/** The colour (0xRRGGBB) the game's map gives a block, or -1 when the files do not know it. `tint` is the chunk's biome tint for the column. */
export function styledBlockColor(style: MapStyle, name: string, tint: number): number {
    const e = style.blocks[name] ?? style.blocks[baseOf(name)];
    if (!e) return -1;
    const [tintUp, biomeUp, particle] = e;
    const sr = tintUp >= 0 ? (tintUp >> 16) & 255 : 255,
        sg = tintUp >= 0 ? (tintUp >> 8) & 255 : 255,
        sb = tintUp >= 0 ? tintUp & 255 : 255;
    const k = biomeUp / 100;
    let r = Math.trunc(sr + (((tint >> 16) & 255) - sr) * k);
    let g = Math.trunc(sg + (((tint >> 8) & 255) - sg) * k);
    let b = Math.trunc(sb + ((tint & 255) - sb) * k);
    if (particle >= 0 && k < 1) {
        r = Math.trunc((r * ((particle >> 16) & 255)) / 255);
        g = Math.trunc((g * ((particle >> 8) & 255)) / 255);
        b = Math.trunc((b * (particle & 255)) / 255);
    }
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

/** The colour of the fluid itself (0xRRGGBB): the environment's water tint for water, times the fluid's particle colour. -1 when unknown. */
export function styledFluidColor(style: MapStyle, fluid: string, environment: string | null): number {
    const e = style.fluids[fluid] ?? style.fluids[baseOf(fluid)];
    if (!e) return -1;
    let r = 255,
        g = 255,
        b = 255;
    const water = environment ? style.waterTint[environment] : undefined;
    if (e[1] && water !== undefined) {
        r = Math.trunc((r * ((water >> 16) & 255)) / 255);
        g = Math.trunc((g * ((water >> 8) & 255)) / 255);
        b = Math.trunc((b * (water & 255)) / 255);
    }
    if (e[0] >= 0) {
        r = Math.trunc((r * ((e[0] >> 16) & 255)) / 255);
        g = Math.trunc((g * ((e[0] >> 8) & 255)) / 255);
        b = Math.trunc((b * (e[0] & 255)) / 255);
    }
    return (r << 16) | (g << 8) | b;
}
