import type { MapMarker } from '@hychunk/core';

export interface MarkerFilters {
    spawns: boolean;
    temples: boolean;
    dungeons: boolean;
    uncommonMobs: boolean;
    farms: boolean;
    portals: boolean;
    prefabs: boolean;
    challenges: boolean;
    encounters: boolean;
    camps: boolean;
    user: boolean;
}

export type MarkerCategory = keyof MarkerFilters | 'commonMobs';

/** Markers grouped because they would overlap on screen. */
export interface MarkerClusterNode {
    x: number;
    z: number;
    screenX: number;
    screenY: number;
    markers: MapMarker[];
}

const DEFAULT_ACCENT = '#f59e0b';
const DEFAULT_COLOR = '#3b82f6';

const CATEGORIES = new Set<string>([
    'spawns',
    'temples',
    'dungeons',
    'uncommonMobs',
    'farms',
    'portals',
    'prefabs',
    'challenges',
    'encounters',
    'camps',
    'user'
]);

/** Which of the map's marker categories a marker belongs to: its own `category`, or a guess from its name and icon. */
export function getMarkerCategory(m: MapMarker): MarkerCategory {
    if (m.category && CATEGORIES.has(m.category)) return m.category as keyof MarkerFilters;
    const name = (m.name || '').toLowerCase();
    const icon = (m.icon || '').toLowerCase();

    // Ordinary mob spawners are left out of the map altogether.
    if (
        name.includes('skeleton') ||
        name.includes('spider') ||
        name.includes('zombie') ||
        name.includes('goblin') ||
        icon.includes('skeleton') ||
        icon.includes('spider') ||
        icon.includes('zombie')
    ) {
        return 'commonMobs';
    }
    if (
        name.includes('dungeon') ||
        name.includes('catacomb') ||
        name.includes('crypt') ||
        name.includes('lair') ||
        icon.includes('dungeon')
    ) {
        return 'dungeons';
    }
    if (
        name.includes('scarak') ||
        name.includes('void') ||
        name.includes('golem') ||
        name.includes('dragon') ||
        name.includes('chieftain') ||
        name.includes('broodmother') ||
        name.includes('boss') ||
        icon.includes('scarak') ||
        icon.includes('void') ||
        icon.includes('golem') ||
        icon.includes('dragon')
    ) {
        return 'uncommonMobs';
    }
    if (
        name.includes('farm') ||
        name.includes('apiary') ||
        name.includes('crop') ||
        name.includes('geode') ||
        icon.includes('farm')
    ) {
        return 'farms';
    }
    if (name.includes('spawn') || icon.includes('spawn')) return 'spawns';
    if (name.includes('temple') || icon.includes('temple')) return 'temples';
    if (name.includes('portal') || icon.includes('portal')) return 'portals';
    if (m.source === 'user' || icon.includes('camp') || icon.includes('home') || icon.includes('user')) return 'user';
    return 'prefabs';
}

const CATEGORY_COLORS: Partial<Record<MarkerCategory, string>> = {
    spawns: '#f59e0b',
    temples: '#8b5cf6',
    dungeons: '#ef4444',
    challenges: '#ef4444',
    uncommonMobs: '#f97316',
    encounters: '#f97316',
    camps: '#a16207',
    farms: '#10b981',
    portals: '#ec4899',
    user: '#06b6d4'
};

/** Categories that give a group of markers its colour; the rest use the default accent. */
const ACCENT_CATEGORIES: MarkerCategory[] = [
    'dungeons',
    'uncommonMobs',
    'temples',
    'farms',
    'spawns',
    'portals',
    'user'
];

/** Higher wins the spot when markers overlap. */
const CATEGORY_PRIORITY: Record<MarkerCategory, number> = {
    dungeons: 10,
    uncommonMobs: 9,
    temples: 8,
    portals: 7,
    spawns: 6,
    farms: 5,
    user: 4,
    challenges: 4,
    prefabs: 3,
    encounters: 3,
    camps: 3,
    commonMobs: 0
};

const CATEGORY_NAMES: Partial<Record<MarkerCategory, string>> = {
    dungeons: 'Dungeons',
    uncommonMobs: 'Bosses / Rare Mobs',
    temples: 'Temples',
    farms: 'Farms',
    spawns: 'Spawns',
    portals: 'Portals',
    prefabs: 'Ruins',
    user: 'Waypoints'
};

/** The icon file (without extension) and colour a marker is drawn with. */
export function markerStyle(m: MapMarker): { icon: string; color: string } {
    const cat = getMarkerCategory(m);
    return { icon: m.icon || defaultIcon(m, cat), color: CATEGORY_COLORS[cat] ?? DEFAULT_COLOR };
}

function defaultIcon(m: MapMarker, cat: MarkerCategory): string {
    const name = (m.name || '').toLowerCase();
    switch (cat) {
        case 'spawns':
            return 'Spawn';
        case 'temples':
            return 'Temple_Gateway';
        case 'dungeons':
            return 'Dungeon';
        case 'farms':
            return 'Farm';
        case 'camps':
            return 'Campfire';
        case 'uncommonMobs':
            if (name.includes('scarak') || name.includes('broodmother')) return 'Scarak_Broodmother';
            if (name.includes('golem')) return 'Golem_Ancient';
            if (name.includes('dragon')) return 'Dragon_Frost';
            if (name.includes('void')) return 'Spawn_Void';
            if (name.includes('trork') || name.includes('chieftain')) return 'Trork_Chieftain';
            return 'Golem_Ancient';
        case 'portals':
            return name.includes('void') ? 'Portal_Void' : name.includes('invasion') ? 'PortalInvasion' : 'Portal';
    }
    if (name.includes('camp')) return 'Campfire';
    if (name.includes('home')) return 'Home';
    if (name.includes('warp')) return 'Warp';
    return m.source === 'user' ? 'UserA' : 'Prefab';
}

/** The colour a group of markers is drawn with: their category's when they share one. */
export function getClusterAccentColor(markers: MapMarker[]): string {
    if (!markers.length) return DEFAULT_ACCENT;
    const first = getMarkerCategory(markers[0]!);
    const shared = markers.every((m) => getMarkerCategory(m) === first);
    return shared && ACCENT_CATEGORIES.includes(first) ? CATEGORY_COLORS[first]! : DEFAULT_ACCENT;
}

/** The tooltip of a group of markers. */
export function getClusterLabel(markers: MapMarker[]): string {
    const first = getMarkerCategory(markers[0]!);
    const shared = markers.every((m) => getMarkerCategory(m) === first);
    const name = (shared && CATEGORY_NAMES[first]) || 'Structures';
    return `${markers.length} ${name} · Click to zoom in`;
}

/** Pointer distance, in pixels, within which a cluster (or a lone marker) counts as under the pointer. */
export function clusterHitRadius(count: number): number {
    if (count <= 1) return 20;
    return count >= 100 ? 24 : count >= 10 ? 20 : 18;
}

export interface ClusterOptions {
    filters: MarkerFilters;
    /** Ids of finished markers; left out when `hideCompleted`. */
    completed: ReadonlySet<string>;
    hideCompleted: boolean;
    /** Pixels per block. */
    scale: number;
}

/**
 * Groups the markers that would overlap. Done in world units (the radius in pixels over the scale), so panning
 * does not change the groups. Markers that rank higher in `CATEGORY_PRIORITY` become the anchor of a group.
 */
export function buildClusters(markers: MapMarker[], o: ClusterOptions): MarkerClusterNode[] {
    const shown: { marker: MapMarker; priority: number }[] = [];
    for (const marker of markers) {
        if (o.hideCompleted && o.completed.has(marker.id)) continue;
        const cat = getMarkerCategory(marker);
        if (cat === 'commonMobs' || !o.filters[cat]) continue;
        shown.push({ marker, priority: CATEGORY_PRIORITY[cat] });
    }
    shown.sort((a, b) => b.priority - a.priority);

    const radius = (o.scale >= 1.5 ? 20 : o.scale >= 0.8 ? 34 : 48) / o.scale;
    const clusters: MarkerClusterNode[] = [];
    const grid = new Map<string, MarkerClusterNode[]>();

    for (const { marker: m } of shown) {
        const gx = Math.floor(m.x / radius),
            gz = Math.floor(m.z / radius);
        let bestDist = radius;
        let best: MarkerClusterNode | null = null;
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                for (const c of grid.get(`${gx + dx},${gz + dz}`) ?? []) {
                    const d = Math.hypot(m.x - c.x, m.z - c.z);
                    if (d < bestDist) {
                        bestDist = d;
                        best = c;
                    }
                }
            }
        }
        if (best) {
            best.markers.push(m);
        } else {
            const node: MarkerClusterNode = { x: m.x, z: m.z, screenX: 0, screenY: 0, markers: [m] };
            clusters.push(node);
            const k = `${gx},${gz}`;
            (grid.get(k) ?? grid.set(k, []).get(k)!).push(node);
        }
    }
    return clusters;
}
