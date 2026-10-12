import type { MapMarker } from '@hychunk/core';
import { getMarkerCategory, type MarkerFilters } from '@hychunk/map';
import { markerImage } from './assets';

export type MarkerCategory = keyof MarkerFilters;

export const MARKER_CATEGORIES: MarkerCategory[] = [
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
];

export const allFilters = (on: boolean) =>
    Object.fromEntries(MARKER_CATEGORIES.map((c) => [c, on])) as unknown as MarkerFilters;

export interface CategoryChip {
    key: MarkerCategory;
    label: string;
    icon: string;
    title: string;
}

export const CATEGORY_CHIPS: CategoryChip[] = [
    {
        key: 'dungeons',
        label: 'Dungeons',
        icon: markerImage('Dungeon'),
        title: 'Dungeons, mines and underground sewers'
    },
    { key: 'challenges', label: 'Challenges', icon: markerImage('Dungeon'), title: 'Combat arenas' },
    { key: 'encounters', label: 'Encounters', icon: markerImage('Prefab'), title: 'Outposts, villages and towns' },
    { key: 'camps', label: 'Camps', icon: markerImage('Campfire'), title: 'NPC camps, forts and towers' },
    {
        key: 'uncommonMobs',
        label: 'Bosses',
        icon: markerImage('Scarak_Broodmother'),
        title: 'Uncommon mobs and bosses'
    },
    { key: 'temples', label: 'Temples', icon: markerImage('Temple_Gateway'), title: 'Ancient temples' },
    { key: 'portals', label: 'Portals', icon: markerImage('Portal'), title: 'Portals to other worlds' },
    { key: 'spawns', label: 'Spawn', icon: markerImage('Spawn'), title: 'Spawn points' },
    { key: 'farms', label: 'Resources', icon: markerImage('Farm'), title: 'Farms and resource spots' },
    { key: 'prefabs', label: 'Other', icon: markerImage('Prefab'), title: 'Monuments and ruins' },
    { key: 'user', label: 'Markers', icon: markerImage('Campfire'), title: 'Markers placed in the save itself' }
];

export const chipLabel = (category: string) => CATEGORY_CHIPS.find((c) => c.key === category)?.label ?? category;

const CATEGORY_NAMES: Record<string, string> = {
    dungeons: 'Dungeon',
    uncommonMobs: 'Boss / rare mob',
    farms: 'Resources',
    spawns: 'Spawn point',
    temples: 'Ancient temple',
    portals: 'Portal',
    prefabs: 'Monument / ruin',
    user: 'Waypoint / base'
};

export const categoryName = (category: string) => CATEGORY_NAMES[category] ?? 'Structure';

// Marker names come from the world data and may be in the save's language, so a few names are matched in Portuguese too.
const isVoid = (name: string) => name.includes('void') || name.includes('vazio');

export function markerIconUrl(m: MapMarker): string {
    const category = getMarkerCategory(m);
    const name = (m.name || '').toLowerCase();
    if (m.icon) return markerImage(m.icon);
    switch (category) {
        case 'spawns':
            return markerImage('Spawn');
        case 'temples':
            return markerImage('Temple_Gateway');
        case 'dungeons':
        case 'challenges':
            return markerImage('Dungeon');
        case 'uncommonMobs':
            if (name.includes('scarak') || name.includes('broodmother')) return markerImage('Scarak_Broodmother');
            if (name.includes('dragon')) return markerImage('Dragon_Frost');
            if (isVoid(name)) return markerImage('Spawn_Void');
            if (name.includes('trork') || name.includes('chieftain')) return markerImage('Trork_Chieftain');
            return markerImage('Golem_Ancient');
        case 'farms':
            return markerImage('Farm');
        case 'camps':
            return markerImage('Campfire');
        case 'portals':
            if (isVoid(name)) return markerImage('Portal_Void');
            return markerImage(name.includes('invasion') ? 'PortalInvasion' : 'Portal');
        case 'user':
            if (name.includes('camp')) return markerImage('Campfire');
            return markerImage(name.includes('home') ? 'Home' : 'UserA');
        default:
            return markerImage('Prefab');
    }
}

export function placeDescription(m: MapMarker): string {
    const name = (m.name || '').toLowerCase();
    const category = getMarkerCategory(m);
    if (name.includes('broodmother') || name.includes('scarak')) {
        return 'Nest of the dreaded Scarak queen: an underground insectoid horror that leads colonies and guards its eggs with venomous stingers.';
    }
    if (name.includes('golem')) {
        return 'An ancient stone guardian built by the first civilizations, with a quartz-plated hide and devastating seismic blows.';
    }
    if (name.includes('dragon')) {
        return 'Lair of the Frost Dragon in the arctic mountains of Borea: freezing breath and rare gems guarded in eternal ice.';
    }
    if (isVoid(name)) {
        return 'An incursion corrupted by the Void. Shadowy creatures and dimensional aberrations pour out of this rift.';
    }
    if (name.includes('trork') || name.includes('chieftain')) {
        return 'Fortified camp of the Trork war chief: reinforced palisades, guard patrols and chests full of iron weapons and loot.';
    }
    switch (category) {
        case 'dungeons':
            return 'A labyrinthine underground complex of traps, puzzles and guardian spawner rooms, ending in a treasure chamber.';
        case 'farms':
            return 'A spot to gather rare resources: Kweebec farmland, magical honey apiaries or concentrated crystal veins.';
        case 'temples':
            return 'A sacred temple raised in honour of the Elements of Orbis, with carved reliefs, blessing altars and sealed portals.';
        case 'portals':
            return 'A rift in space connecting this world to other dimensions, floating abysses or fragmented realms.';
        case 'spawns':
            return 'The sacred origin point of Orbis: a protected area where heroes awaken.';
        default:
            return 'An ancient monument or ruin of Orbis, with historic architecture and places to explore.';
    }
}
