// What the game spawns where. The world's NPC spawns are tables keyed by environment (`Server/NPC/Spawn/World`), and
// the biomes say which environment each column has, so "which mobs live here" and "where does this mob live" follow
// from the two. Spawn markers placed inside structures (prefabs) are listed by name, and each marker names its NPCs.

export interface SpawnNpc { id: string; weight: number; flock?: string; fluid?: string }

export interface SpawnGroup {
    /** The file's name without folders: `Spawns_Zone1_Fish_Tier1`. */
    name: string;
    envs: string[];
    npcs: SpawnNpc[];
    /** `DayTimeRange`: the hours of the day the spawns happen in. */
    day?: [number, number];
}

export interface SpawnMarkerDef { npcs: { name: string; weight: number }[] }

export interface SpawnTable {
    groups: SpawnGroup[];
    /** `Server/NPC/Spawn/Markers/**`, by file name. */
    markers: Record<string, SpawnMarkerDef>;
}

interface PackLike {
    list(prefix?: string): string[];
    read(path: string): Promise<Uint8Array>;
}

/** The game's files allow comments and trailing commas. */
function parse(text: string): any {
    return JSON.parse(text.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'));
}

export async function buildSpawnTable(pack: PackLike): Promise<SpawnTable> {
    const decoder = new TextDecoder();
    const groups: SpawnGroup[] = [];
    for (const file of pack.list('Server/NPC/Spawn/World/').filter((f) => f.endsWith('.json'))) {
        const j = parse(decoder.decode(await pack.read(file)));
        if (!Array.isArray(j.Environments) || !Array.isArray(j.NPCs)) continue;
        groups.push({
            name: file.slice(file.lastIndexOf('/') + 1, -5),
            envs: j.Environments,
            npcs: (j.NPCs as any[]).map((n) => ({ id: n.Id, weight: n.Weight ?? 1, ...(n.Flock ? { flock: n.Flock } : {}), ...(n.SpawnFluidTag ? { fluid: n.SpawnFluidTag } : {}) })),
            ...(Array.isArray(j.DayTimeRange) ? { day: [j.DayTimeRange[0], j.DayTimeRange[1]] as [number, number] } : {})
        });
    }
    const markers: Record<string, SpawnMarkerDef> = {};
    for (const file of pack.list('Server/NPC/Spawn/Markers/').filter((f) => f.endsWith('.json'))) {
        const j = parse(decoder.decode(await pack.read(file)));
        if (!Array.isArray(j.NPCs)) continue;
        markers[file.slice(file.lastIndexOf('/') + 1, -5)] = { npcs: (j.NPCs as any[]).map((n) => ({ name: n.Name, weight: n.Weight ?? 1 })) };
    }
    return { groups, markers };
}

export interface MobShare {
    id: string;
    /** Out of 100, within its group. */
    share: number;
    flock?: string;
    fluid?: string;
    /** The group it comes from, as a readable label. */
    group: string;
    day?: [number, number];
}

export interface Spawns {
    /** Every NPC that some table spawns, sorted. */
    mobs(): string[];
    /** The mobs of each table that covers the environment. */
    mobsIn(env: string): MobShare[];
    /** The environments where the NPC spawns. */
    envsOf(id: string): string[];
    /** The NPCs a spawn marker (inside a structure) can produce. */
    markerNpcs(marker: string): string[];
}

const label = (name: string) => name.replace(/^Spawns_/, '').replace(/_/g, ' ');

export function makeSpawns(table: SpawnTable): Spawns {
    const byEnv = new Map<string, SpawnGroup[]>();
    const envsByMob = new Map<string, Set<string>>();
    for (const g of table.groups) {
        for (const e of g.envs) {
            (byEnv.get(e) ?? byEnv.set(e, []).get(e)!).push(g);
            for (const n of g.npcs) (envsByMob.get(n.id) ?? envsByMob.set(n.id, new Set()).get(n.id)!).add(e);
        }
    }
    const mobList = [...envsByMob.keys()].sort();
    return {
        mobs: () => mobList,
        mobsIn(env) {
            const out: MobShare[] = [];
            for (const g of byEnv.get(env) ?? []) {
                const total = g.npcs.reduce((a, n) => a + n.weight, 0) || 1;
                for (const n of g.npcs) out.push({ id: n.id, share: Math.round((n.weight / total) * 100), ...(n.flock ? { flock: n.flock } : {}), ...(n.fluid ? { fluid: n.fluid } : {}), group: label(g.name), ...(g.day ? { day: g.day } : {}) });
            }
            return out;
        },
        envsOf: (id) => [...(envsByMob.get(id) ?? [])],
        markerNpcs: (marker) => (table.markers[marker]?.npcs ?? []).map((n) => n.name)
    };
}
