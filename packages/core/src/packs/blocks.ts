import { readJson, type AssetPack } from './pack';

/** Shape codes shared with the generated colour table: 1 is a plain cube. */
export const SHAPE_NONE = 0;
export const SHAPE_CUBE = 1;
export const SHAPE_LEAVES = 2;
export const SHAPE_PLANT = 3;
export const SHAPE_HALF = 4;

export interface BlockStyle {
    shape: number;
    /** Face textures as paths under `Common/` (`BlockTextures/Rock_Stone.png`). */
    up?: string;
    down?: string;
    north?: string;
    south?: string;
    east?: string;
    west?: string;
    /** 0xRRGGBB multiplied into the top face (grass) and into every face (`tint`, for plants and leaves). */
    tintUp?: number;
    tint?: number;
    /** `BiomeTintUp`: how far (0 to 100) the top face follows the chunk's biome tint instead of its own. */
    biomeTint?: number;
    /** `ParticleColor`: the colour the game's map multiplies a block by. */
    particle?: number;
    /** A `.blockymodel` under `Common/`, and the texture it is painted with. */
    model?: string;
    modelTexture?: string;
    /** Has see-through pixels (leaves, plants): drawn with alpha testing. */
    cutout?: boolean;
    /** Translation key of the display name. */
    name?: string;
}

export interface BlockTable {
    blocks: Record<string, BlockStyle>;
    /** Fluid id → its texture. */
    fluids: Record<string, { texture?: string; particle?: number; water?: boolean }>;
    /** Environment id → its `WaterTint` (0xRRGGBB), inherited through `Parent`; environments without one are left out. */
    environments: Record<string, number>;
}

const hex = (s: unknown): number | undefined => {
    if (typeof s !== 'string') return undefined;
    if (/^#[0-9a-f]{6}/i.test(s)) return parseInt(s.slice(1, 7), 16);
    if (/^#[0-9a-f]{3}$/i.test(s)) return parseInt(s[1]! + s[1]! + s[2]! + s[2]! + s[3]! + s[3]!, 16);
    return undefined;
};
const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1, -5);
const modelName = (m?: string) => (m ?? '').replace(/.*\//, '').replace('.blockymodel', '');

const DECOR_MODELS =
    /Fence|Spike|Statue|Barrel|Watering|Stalact|Stalagm|Torch|Lantern|Chain|Rope|Banner|Candle|Lamp|Chest|Crate|Bed|Table|Chair|Bench/;
const PLANT_IDS =
    /^Plant_(Grass|Flower|Fern|Bush|Moss|Reeds|Crop|Sapling|Fruit|Mushroom|Bramble|Cactus|Coral|Seaweed|Kelp|Lily|Wheat)/;

function shapeOf(id: string, bt: any): number {
    if (bt.Material === 'Empty' && !/^Plant_/.test(id)) return SHAPE_NONE;
    if (bt.DrawType === 'Empty') return SHAPE_NONE;
    if (/^Plant_Leaves_/.test(id)) return SHAPE_LEAVES;
    if (bt.Material === 'Solid') {
        const m = modelName(bt.CustomModel);
        if (/HalfBlock/.test(m)) return SHAPE_HALF;
        if (bt.DrawType === 'Model' && DECOR_MODELS.test(m)) return SHAPE_NONE;
        return SHAPE_CUBE;
    }
    if (PLANT_IDS.test(id) || /Cross|Bush|Dense/.test(modelName(bt.CustomModel))) return SHAPE_PLANT;
    return SHAPE_NONE;
}

/**
 * Reads block and fluid definitions from packs — the game first, then plugins, whose
 * definitions add to or replace its own — and works out how each block is drawn.
 * `progress` is called now and then with the fraction done.
 */
export async function buildBlockTable(packs: AssetPack[], progress?: (done: number) => void): Promise<BlockTable> {
    const defs = new Map<string, any>();
    const fluidDefs = new Map<string, any>();
    const envDefs = new Map<string, any>();
    const jobs: { pack: AssetPack; path: string; fluid: boolean; env?: boolean }[] = [];
    for (const pack of packs) {
        for (const path of pack.list('Server/Item/Items/'))
            if (path.endsWith('.json')) jobs.push({ pack, path, fluid: false });
        for (const path of pack.list('Server/Item/Block/Fluids/'))
            if (path.endsWith('.json')) jobs.push({ pack, path, fluid: true });
        for (const path of pack.list('Server/Environments/'))
            if (path.endsWith('.json')) jobs.push({ pack, path, fluid: false, env: true });
    }
    let done = 0;
    // Definitions are small and the pack is read in place, so a few at a time keeps this quick without flooding it.
    const queue = jobs.slice();
    await Promise.all(
        Array.from({ length: 8 }, async () => {
            for (let job = queue.shift(); job; job = queue.shift()) {
                try {
                    (job.env ? envDefs : job.fluid ? fluidDefs : defs).set(
                        baseName(job.path),
                        await readJson(job.pack, job.path)
                    );
                } catch {
                    /* a definition that is not plain JSON is skipped */
                }
                if (++done % 400 === 0) progress?.(done / jobs.length);
            }
        })
    );

    const merged = (id: string, depth = 0): any => {
        const d = defs.get(id);
        if (!d || depth > 8) return {};
        return { ...(d.Parent ? merged(d.Parent, depth + 1) : {}), ...(d.BlockType ?? {}) };
    };
    const fluidMerged = (id: string, depth = 0): any => {
        const d = fluidDefs.get(id);
        return !d || depth > 8 ? {} : { ...(d.Parent ? fluidMerged(d.Parent, depth + 1) : {}), ...d };
    };

    const blocks: Record<string, BlockStyle> = {};
    for (const [id, def] of defs) {
        const bt = merged(id);
        if (!Object.keys(bt).length) continue;
        const t = first<any>(bt.Textures);
        const all = t?.All;
        const style: BlockStyle = { shape: shapeOf(id, bt) };
        if (t) {
            style.up = t.Up ?? t.UpDown ?? all;
            style.down = t.Down ?? t.UpDown ?? all;
            const sides = t.Sides ?? all;
            style.north = t.North ?? sides;
            style.south = t.South ?? sides;
            style.east = t.East ?? sides;
            style.west = t.West ?? sides;
        }
        const model = bt.CustomModel as string | undefined;
        if (model) {
            style.model = model;
            style.modelTexture = first<any>(bt.CustomModelTexture)?.Texture;
        }
        // `Tint` colours every face, the top included; `TintUp` then overrides the top alone (as the game's codec reads them)
        style.tintUp = hex(first(bt.TintUp ?? bt.Tint));
        style.tint = hex(first(bt.Tint));
        style.biomeTint =
            typeof bt.BiomeTintUp === 'number'
                ? bt.BiomeTintUp
                : typeof bt.BiomeTint === 'number'
                  ? bt.BiomeTint
                  : undefined;
        style.particle = hex(bt.ParticleColor);
        style.cutout =
            bt.Opacity === 'Cutout' || bt.Opacity === 'Transparent' || bt.Opacity === 'Semitransparent'
                ? true
                : undefined;
        style.name = def?.TranslationProperties?.Name;
        for (const k of Object.keys(style) as (keyof BlockStyle)[]) if (style[k] === undefined) delete style[k];
        blocks[id] = style;
    }

    const fluids: BlockTable['fluids'] = {};
    for (const id of fluidDefs.keys()) {
        const f = fluidMerged(id);
        fluids[id] = {
            texture: first<any>(f.Textures)?.All,
            particle: hex(f.ParticleColor),
            water: Array.isArray(f.Effect) && f.Effect.includes('Water') ? true : undefined
        };
        for (const k of Object.keys(fluids[id]!) as (keyof (typeof fluids)[string])[])
            if (fluids[id]![k] === undefined) delete fluids[id]![k];
    }
    const envMerged = (id: string, depth = 0): any => {
        const d = envDefs.get(id);
        return !d || depth > 12 ? {} : { ...(d.Parent ? envMerged(d.Parent, depth + 1) : {}), ...d };
    };
    const environments: BlockTable['environments'] = {};
    for (const id of envDefs.keys()) {
        const tint = hex(envMerged(id).WaterTint);
        if (tint !== undefined) environments[id] = tint;
    }
    progress?.(1);
    return { blocks, fluids, environments };
}
