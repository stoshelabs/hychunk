export interface SpawnPoint {
    x: number;
    y: number;
    z: number;
    yaw: number;
}

export interface WorldConfig {
    seed: number | bigint;
    spawn: SpawnPoint | null;
    worldGen: string | null;
    /** `WorldGen.Type`: `Hytale` (procedural), `Flat` (layers in the config), `Void`, or something a plugin registers. */
    worldGenType: string | null;
    /** Plugins the world declares it needs (`RequiredPlugins`). */
    requiredPlugins: string[];
    /** `ChunkStorage.Type`; HyChunk reads `Hytale` (region files) only. */
    chunkStorage: string | null;
}

/** Reads the parts of a world's `config.json` a map needs. */
export function parseWorldConfig(json: unknown): WorldConfig {
    const c = json as Record<string, any>;
    const p = c?.SpawnProvider?.SpawnPoint;
    return {
        seed: c?.Seed ?? 0,
        spawn: p ? { x: p.X, y: p.Y, z: p.Z, yaw: p.Yaw ?? 0 } : null,
        worldGen: c?.WorldGen?.Name ?? null,
        worldGenType: c?.WorldGen?.Type ?? null,
        requiredPlugins: Object.keys(c?.RequiredPlugins ?? {}),
        chunkStorage: c?.ChunkStorage?.Type ?? null
    };
}

/** `X.Z.region.bin` → region coordinates, or `null` when the name is something else. */
export function parseRegionName(name: string): { rx: number; rz: number } | null {
    const m = /^(-?\d+)\.(-?\d+)\.region\.bin$/.exec(name);
    return m ? { rx: Number(m[1]), rz: Number(m[2]) } : null;
}

export interface GeneratorInfo {
    kind: 'default' | 'flat' | 'void' | 'custom';
    label: string;
    /** True when the terrain depends on code HyChunk does not have: a seed alone would not reproduce it. */
    needsServer: boolean;
}

/**
 * What kind of terrain a world has. Saved chunks are always readable whatever made
 * them; this matters for anything that would *regenerate* terrain from the seed.
 */
export function describeGenerator(c: WorldConfig): GeneratorInfo {
    const type = c.worldGenType ?? 'Hytale';
    if (type === 'Hytale' && (!c.worldGen || c.worldGen === 'Default'))
        return { kind: 'default', label: 'Hytale (default)', needsServer: false };
    if (type === 'Flat') return { kind: 'flat', label: 'Flat (layers from config)', needsServer: false };
    if (type === 'Void') return { kind: 'void', label: 'Void', needsServer: false };
    return { kind: 'custom', label: c.worldGen ? `${type}: ${c.worldGen}` : type, needsServer: true };
}
