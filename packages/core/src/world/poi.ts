import type { MapMarker } from './markers';

/** What the generator says about a unique structure (`TerrainGen.uniquePrefabs`). */
interface UniqueSpot {
    name: string;
    zone: string;
    x: number;
    y: number;
    z: number;
    isSpawn: boolean;
    marks?: { block: string; x: number; y: number; z: number }[];
}

/** Where a cave of a dungeon-like type begins (`TerrainGen.caveEntries`). */
interface CaveSpot {
    type: string;
    entry: string;
    zone: string;
    x: number;
    y: number;
    z: number;
}

/** A repeated structure (`TerrainGen.prefabSites`). */
interface Site {
    x: number;
    y: number;
    z: number;
    name: string;
    key: string;
    biome: string;
    marks?: { block: string; x: number; y: number; z: number }[];
    spawns?: string[];
}

/**
 * Where the structures are worked out, which may be another thread: the unique ones, and the repeated ones square by square.
 * Both are about the world as the generator makes it, so they are there for chunks the save never visited and for a bare seed.
 */
export interface StructureSource {
    unique(): Promise<UniqueSpot[]>;
    /** Where the dungeon-like caves begin inside the same square (`TerrainGen.caveEntries`). Optional: a source may not know caves. */
    caves?(x: number, z: number, size: number): Promise<CaveSpot[]>;
    /** The `Monuments.*` sites whose spot lies in the square `[x, x + size) × [z, z + size)`. */
    square(x: number, z: number, size: number): Promise<Site[]>;
    dispose(): void;
}

/** Persistence for the squares already worked out. */
export interface MarkerStore {
    load(): Promise<Record<string, unknown[]> | null>;
    save(cells: Record<string, unknown[]>): void;
}

export type { UniqueSpot, Site, CaveSpot };

/** `Npc.Outlander.Camps.*` is a camp or village of NPCs, `Monuments.Challenge.Grass.*` is a challenge, `Monuments.Unique.Temple.…` a temple, and so on. */
export function siteCategory(key: string): string {
    const parts = key.split('.');
    if (parts[0] === 'Npc') return 'camps';
    if (parts[1] === 'Challenge') return 'challenges';
    if (parts[1] === 'Encounter') return 'encounters';
    if (parts[1] === 'Unique' && parts[2] === 'Temple') return 'temples';
    return 'prefabs';
}

/**
 * Whether a structure earns a marker: places worth a trip (loot, dungeons, arenas, forts, bosses). The rest (paths, ruins, huts, camp
 * clutter) is still drawn on the map, only not marked: dozens of dots bury the few that matter.
 */
export function isNotable(key: string): boolean {
    const p = key.split('.');
    switch (p[0]) {
        case 'Npc': {
            const [, race, kind] = p;
            if (race === 'Trork') return (kind === 'Tier_2' || kind === 'Tier_3') && p[3] !== 'Store';
            if (race === 'Feran')
                return (kind === 'Tier2' || kind === 'Tier3') && (p[3] === 'Layout' || p[3] === 'Chieftain');
            if (race === 'Outlander') return kind === 'Forts' || kind === 'Towers' || kind === 'Ice_Caves';
            if (race === 'Scarak')
                return (
                    kind === 'Scarak_Scarak_Best_001' ||
                    (kind === 'Scarak_Hives' &&
                        /^(Tier_\d\.)?Surface$/.test(p.slice(3, p[3] === 'Surface' ? 4 : 5).join('.')))
                );
            return race === 'Hedera' || race === 'Dragons' || (race === 'Yeti' && kind === 'Camps');
        }
        case 'Monuments': {
            const [, group, a, b] = p;
            if (group === 'Challenge' || group === 'Story') return true;
            if (group === 'Incidental') return a === 'Treasure_Rooms' || a === 'Shipwrecks';
            if (group === 'Encounter') {
                if (a === 'City_Ruins')
                    return b === 'Temple' || b === 'Sewer_Entrance' || b === 'Gatehouse' || b === 'Towers';
                if (a === 'City_Oceans') return b === 'Buildings_Capital' || b === 'Buildings_Tower';
                return !/Path/.test(a ?? '') && !/Path/.test(b ?? '');
            }
            if (group === 'Unique')
                return (
                    a === 'Mage_Towers' ||
                    a === 'Story_Dungeon' ||
                    a === 'Story_Gate' ||
                    a === 'World_Portal' ||
                    a === 'World_Gate' ||
                    (a === 'Temple' && b !== 'Bridge')
                );
            return false;
        }
        default:
            return false;
    }
}

/**
 * `Forgotten_Temple_Portal_Enter` leads into the `Forgotten_Temple` instance: the name is the part before `_Portal`.
 * Other blocks fall back to their own name.
 */
export function portalLabel(block: string): string {
    const m = /^(.*?)_?Portal/i.exec(block);
    if (!m) return block.replace(/_/g, ' ');
    const where = m[1]!.replace(/_/g, ' ').trim();
    return where ? `${where} portal` : 'Portal';
}

const BIOMES: Record<string, string> = {
    Grass: 'Grasslands',
    Grass_Dry: 'Dry grasslands',
    Grass_Cold: 'Cold grasslands',
    Snow: 'Snow',
    Sand: 'Desert',
    Volcanic: 'Volcanic',
    Shale: 'Shale',
    Sandstone: 'Sandstone',
    Quartzite: 'Quartzite'
};

const ENCOUNTERS: Record<string, string> = {
    Outpost: 'Outpost',
    Outpost_Boss: 'Outpost (boss)',
    Outpost_NoBoss: 'Outpost',
    Military_Outpost: 'Military outpost',
    Village: 'Village',
    Tradingpost: 'Trading post',
    Trork: 'Trork camp',
    Quarry: 'Quarry',
    Orbis_Camp: 'Orbis camp',
    Battlefield: 'Battlefield',
    Normal: 'Encounter',
    Frozen: 'Frozen encounter'
};

const CAVE_KINDS: [RegExp, string][] = [
    [/Mineshaft/i, 'Mineshaft'],
    [/Goblin Lair/i, 'Goblin lair'],
    [/Sewer/i, 'Sewer'],
    [/Hive/i, 'Hive'],
    [/Outlander Temple/i, 'Outlander temple'],
    [/Dungeon/i, 'Dungeon']
];

const CAVE_WORDS: Record<string, string> = { Drift: 'Vein' };

/** `Grasslands_Mountain_Goblin_Lair` reads as "Goblin lair · Grasslands Mountain". */
export function caveLabel(type: string): string {
    const text = type.replace(/^Env_/, '').replace(/_/g, ' ').trim();
    const zone = /Zone(\d)/.exec(text);
    const base = text.replace(/Zone\d\s*/, '').trim();
    const kind = CAVE_KINDS.find(([pattern]) => pattern.test(base))?.[1] ?? base;
    const rest = base
        .replace(/Mineshafts?|Goblin Lair|Sewer|Hives?|Outlander Temple|Dungeons?/gi, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => CAVE_WORDS[w] ?? w)
        .join(' ');
    const where = [zone ? `Zone ${zone[1]}` : '', rest].filter(Boolean).join(', ');
    return [kind, where].filter(Boolean).join(' · ');
}

const BUILDINGS: Record<string, string> = {
    Temple: 'temple',
    Sewer_Entrance: 'sewer entrance',
    Gatehouse: 'gatehouse'
};

const UNIQUE_NAMES: Record<string, string> = {
    Mage_Towers: 'Mage tower',
    Story_Dungeon: 'Story dungeon',
    Story_Gate: 'Story gate',
    World_Portal: 'World portal',
    World_Gate: 'World gate',
    Temple: 'Temple'
};

/** The name a structure's marker shows: `Npc.Trork.Tier_3.Watchtower.*` reads as "Trork watchtower (tier 3)". */
export function siteTitle(key: string): string {
    const p = key.split('.');
    const tier = (v: string | undefined) => {
        const m = /(\d)/.exec(v ?? '');
        return m ? ` (tier ${m[1]})` : '';
    };
    if (p[0] === 'Npc') {
        const [, race, kind, a] = p;
        switch (race) {
            case 'Yeti':
                return 'Yeti camp';
            case 'Trork': {
                const t = tier(kind);
                if (a === 'Watchtower') return `Trork watchtower${t}`;
                if (a === 'Encampment') {
                    const place =
                        p[4] === 'Castle'
                            ? 'castle'
                            : p[4] === 'Quarry'
                              ? 'quarry'
                              : p[4] === 'Lumber'
                                ? 'lumber camp'
                                : 'encampment';
                    return `Trork ${place}${t}`;
                }
                return `Trork camp${t}`;
            }
            case 'Outlander': {
                const place = kind === 'Forts' ? 'fort' : kind === 'Towers' ? 'tower' : 'ice cave';
                return `Outlander ${place}${tier(a)}`;
            }
            case 'Hedera':
                return kind === 'Throne' ? 'Hedera throne' : `Hedera shrine${tier(a)}`;
            case 'Feran':
                return `${a === 'Chieftain' ? 'Feran chieftain' : 'Feran village'}${tier(kind)}`;
            case 'Scarak':
                return kind === 'Scarak_Hives' ? `Scarak hive${tier(a)}` : 'Scarak lair';
            case 'Dragons':
                return 'Ice dragon';
        }
    }
    if (p[0] === 'Monuments') {
        const [, group, a, b] = p;
        if (group === 'Challenge') return `Combat challenge · ${BIOMES[a ?? ''] ?? (a ?? '').replace(/_/g, ' ')}`;
        if (group === 'Encounter') {
            const zone = /Zone(\d)/.exec(a ?? '');
            if (zone)
                return `${ENCOUNTERS[p[4] ?? ''] ?? (p[4] ?? 'Encounter').replace(/_/g, ' ')} · Zone ${zone[1]}${tier(b)}`;
            if (a === 'City_Ruins') return `Ruined city · ${BUILDINGS[b ?? ''] ?? 'tower'}`;
            if (a === 'City_Oceans') return b === 'Buildings_Capital' ? 'Ocean capital' : 'Ocean tower';
            if (a === 'Shale') return 'Frozen encounter';
        }
        if (group === 'Incidental') {
            return a === 'Treasure_Rooms' ? 'Treasure room' : a === 'Shipwrecks' ? 'Shipwreck' : siteLabel(key);
        }
        if (group === 'Unique') {
            const biome = BIOMES[b ?? ''];
            return (UNIQUE_NAMES[a ?? ''] ?? siteLabel(key)) + (biome ? ` · ${biome}` : '');
        }
        if (group === 'Story') {
            return a === 'Forgotten_temple' ? 'Forgotten temple' : a === 'Story_gate' ? 'Story gate' : 'Story start';
        }
    }
    return siteLabel(key);
}

/** The cave types worth a marker: dungeons and the like. The rest are ore veins and plain caves, far too many to show. */
export const DUNGEON_CAVES = /Dungeon|Goblin_Lair|Sewer|Mineshaft|Hive|Outlander_Temple/;

/** `Monuments.Incidental.Quartzite.Ruins.*` reads as "Incidental Quartzite Ruins". */
export function siteLabel(key: string): string {
    return key
        .split('.')
        .slice(1)
        .filter((p) => p !== '*')
        .join(' ')
        .replace(/_/g, ' ');
}

/** How far apart (in blocks) two markers of a group can be and still be the same place, and what the place is called. */
const GROUPS: { match: RegExp; radius: number; name?: string }[] = [
    { match: /^city-ruins$/, radius: 200, name: 'Ruined city' },
    { match: /^city-oceans$/, radius: 200, name: 'Ocean city' },
    { match: /^cave:/, radius: 96 }
];

/** The group a structure's marker belongs to, when its pieces are one place: `Monuments.Encounter.City_Ruins.*` is a city of several buildings. */
export function siteGroup(key: string): string | undefined {
    const p = key.split('.');
    if (p[0] === 'Monuments' && p[1] === 'Encounter') {
        if (p[2] === 'City_Ruins') return 'city-ruins';
        if (p[2] === 'City_Oceans') return 'city-oceans';
    }
    return undefined;
}

/**
 * Markers of the same group that lie within the group's radius of each other are redundant: only the first is kept, where it really is. A city with several
 * buildings or a dungeon with two entrances is one place on the map and one line in the list.
 */
export function mergeGroups(markers: MapMarker[]): MapMarker[] {
    const grouped = new Map<string, MapMarker[]>();
    const out: MapMarker[] = [];
    for (const m of markers) {
        if (!m.group) out.push(m);
        else (grouped.get(m.group) ?? grouped.set(m.group, []).get(m.group)!).push(m);
    }
    for (const [group, members] of grouped) {
        const rule = GROUPS.find((g) => g.match.test(group));
        const radius = rule?.radius ?? 0;
        // single linkage: a marker joins every cluster it lies close to
        const cluster = members.map((_, i) => i);
        const find = (i: number): number => (cluster[i] === i ? i : (cluster[i] = find(cluster[i]!)));
        for (let i = 0; i < members.length; i++)
            for (let j = i + 1; j < members.length; j++)
                if (Math.hypot(members[i]!.x - members[j]!.x, members[i]!.z - members[j]!.z) <= radius)
                    cluster[find(j)] = find(i);
        const parts = new Map<number, MapMarker[]>();
        members.forEach((m, i) => (parts.get(find(i)) ?? parts.set(find(i), []).get(find(i))!).push(m));
        for (const list of parts.values()) {
            if (list.length === 1) {
                out.push(list[0]!);
                continue;
            }
            list.sort((a, b) => (a.id < b.id ? -1 : 1));
            const spawns = [...new Set(list.flatMap((m) => m.spawns ?? []))];
            out.push({
                ...list[0]!,
                name: rule?.name ?? list[0]!.name,
                ...(spawns.length ? { spawns } : {})
            });
        }
    }
    return out;
}

const CELL = 512;
/** More cells than this on screen and the structures are left out: the map is too far out to tell them apart. */
const MAX_CELLS = 400;

/**
 * Structures the world generator places: the spawn room and the temple (once each), and the monuments the biomes repeat.
 * They come from the generator itself, so a seed without the generator's files has none. The repeated ones are worked out a
 * 512-block square at a time, nearest to the view first, and `onUpdate` is called when a square is done.
 */
export class PoiGenerator {
    private unique: MapMarker[] = [];
    private cells = new Map<string, MapMarker[]>();
    private wanted: { cx: number; cz: number }[] = [];
    private centre = { x: 0, z: 0 };
    private running = 0;
    private disposed = false;

    /**
     * `parallel`: how many squares are asked of the source at once (a source backed by several workers can take more than one).
     * `store`: where finished squares are kept between visits, so coming back to a world shows its structures at once.
     */
    constructor(
        readonly seed: number,
        private source?: StructureSource,
        private onUpdate?: () => void,
        private parallel = 1,
        private store?: MarkerStore
    ) {
        store
            ?.load()
            .then((saved) => {
                if (!saved || this.disposed) return;
                for (const [k, list] of Object.entries(saved))
                    if (!this.cells.has(k)) this.cells.set(k, list as MapMarker[]);
                this.revision++;
                this.onUpdate?.();
            })
            .catch(() => {});
        source
            ?.unique()
            .then((list) => {
                if (this.disposed) return;
                this.unique = list.flatMap((s): MapMarker[] => [
                    {
                        id: `unique-${s.zone}-${s.name}`,
                        name: s.isSpawn ? 'Spawn room' : 'Temple', // the world's own spawn point (the server's) is drawn by the map as `Spawn`
                        x: s.x,
                        y: s.y,
                        z: s.z,
                        source: 'block' as const,
                        icon: s.isSpawn ? 'Spawn' : 'Temple_Gateway'
                    },
                    // a temple with a door to another world is shown by the door too
                    ...(s.marks ?? []).map((m, i) => ({
                        id: `portal-${m.x}-${m.z}-${i}`,
                        name: portalLabel(m.block),
                        x: m.x,
                        y: m.y,
                        z: m.z,
                        source: 'block' as const,
                        icon: 'Portal',
                        category: 'portals',
                        block: m.block
                    }))
                ]);
                this.revision++;
                this.onUpdate?.();
            })
            .catch((e) => console.warn('Failed to place the unique structures:', e));
    }

    private mergedAt = -1;
    private merged: MapMarker[] = [];

    /** Every marker of the squares worked out so far, with the pieces of one place merged (redone when a square comes in). */
    private mergedMarkers(): MapMarker[] {
        if (this.mergedAt !== this.revision) {
            this.merged = mergeGroups([...this.cells.values()].flat());
            this.mergedAt = this.revision;
        }
        return this.merged;
    }

    /** The structures inside a world block bounding box; squares not worked out yet are filled in later. */
    getMarkersInRect(minX: number, minZ: number, maxX: number, maxZ: number): MapMarker[] {
        const out = this.unique.filter((m) => m.x >= minX && m.x <= maxX && m.z >= minZ && m.z <= maxZ);
        if (!this.source) return out;
        const c0 = Math.floor(minX / CELL),
            c1 = Math.floor(maxX / CELL),
            r0 = Math.floor(minZ / CELL),
            r1 = Math.floor(maxZ / CELL);
        if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_CELLS) return out;
        this.centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
        this.wanted = [];
        for (let cz = r0; cz <= r1; cz++) {
            for (let cx = c0; cx <= c1; cx++) {
                if (!this.cells.has(`${cx},${cz}`)) this.wanted.push({ cx, cz });
            }
        }
        this.pump();
        for (const m of this.mergedMarkers()) if (m.x >= minX && m.x <= maxX && m.z >= minZ && m.z <= maxZ) out.push(m);
        return out;
    }

    /** Keeps `parallel` squares in work, each time the nearest to the middle of the view that is still wanted. */
    private pump() {
        while (!this.disposed && this.running < this.parallel && this.wanted.length) {
            let best = 0,
                bestD = Infinity;
            this.wanted.forEach((w, i) => {
                const d = Math.hypot((w.cx + 0.5) * CELL - this.centre.x, (w.cz + 0.5) * CELL - this.centre.z);
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            });
            const cell = this.wanted.splice(best, 1)[0]!;
            this.running++;
            void this.work(cell.cx, cell.cz);
        }
    }

    private async work(cx: number, cz: number) {
        try {
            const [sites, caves] = await Promise.all([
                this.source!.square(cx * CELL, cz * CELL, CELL),
                this.source!.caves ? this.source!.caves(cx * CELL, cz * CELL, CELL) : Promise.resolve([] as CaveSpot[])
            ]);
            if (this.disposed) return;
            const caveMarkers: MapMarker[] = caves.map((c) => ({
                id: `cave-${c.x}-${c.z}-${c.type}`,
                name: caveLabel(c.type),
                x: c.x,
                y: c.y,
                z: c.z,
                source: 'block' as const,
                icon: null,
                category: 'dungeons',
                group: `cave:${c.type}`
            }));
            this.cells.set(`${cx},${cz}`, [
                ...caveMarkers,
                ...sites.flatMap((s): MapMarker[] => {
                    if (!s.marks?.length && !isNotable(s.key)) return [];
                    // a structure with a door to another world is shown by the door
                    if (s.marks?.length) {
                        return s.marks.map((m, i) => ({
                            id: `portal-${m.x}-${m.z}-${i}`,
                            name: portalLabel(m.block),
                            x: m.x,
                            y: m.y,
                            z: m.z,
                            source: 'block' as const,
                            icon: 'Portal',
                            category: 'portals',
                            block: m.block
                        }));
                    }
                    return [
                        {
                            id: `site-${s.x}-${s.z}-${s.name}`,
                            name: siteTitle(s.key),
                            x: s.x,
                            y: s.y,
                            z: s.z,
                            source: 'block' as const,
                            icon: null,
                            category: siteCategory(s.key),
                            ...(siteGroup(s.key) ? { group: siteGroup(s.key) } : {}),
                            ...(s.spawns?.length ? { spawns: s.spawns } : {})
                        }
                    ];
                })
            ]);
            this.revision++;
            this.onUpdate?.();
            this.saveSoon();
        } catch (e) {
            console.warn('Failed to place the structures of a square:', e);
            this.cells.set(`${cx},${cz}`, []); // do not ask again for this one
            this.failed.add(`${cx},${cz}`);
        } finally {
            this.running--;
        }
        this.pump();
    }

    /** Grows each time the markers change, so callers can reuse what they worked out from them. */
    revision = 0;

    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private failed = new Set<string>();

    /** A moment after the squares stop coming, writes them all (squares that failed, kept empty, are left out). */
    private saveSoon() {
        if (!this.store || this.saveTimer !== null) return;
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            if (this.running || this.wanted.length) {
                this.saveSoon();
                return;
            }
            this.store!.save(Object.fromEntries([...this.cells].filter(([k]) => !this.failed.has(k))));
        }, 4000);
    }

    dispose() {
        this.disposed = true;
        if (this.saveTimer !== null) clearTimeout(this.saveTimer);
        this.source?.dispose();
    }
}
