import { computed, ref, watch } from 'vue';
import { getMarkerCategory } from '@hychunk/map';
import type { MapMarker } from '@hychunk/core';
import { downloadBlob } from '../lib/download';
import { t } from '../lib/i18n';
import {
    CATEGORY_CHIPS,
    categoryName,
    chipLabel,
    markerIconUrl,
    placeDescription,
    type MarkerCategory
} from '../lib/markers';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';
import { seed32 } from '../lib/seed';
import { useGameData } from './useGameData';
import { useMarkerFilters } from './useMarkerFilters';
import { useSession } from './useSession';

export interface Place extends MapMarker {
    category: MarkerCategory | 'commonMobs';
    iconUrl: string;
}

export interface PlaceDetails extends Place {
    description: string;
    distance: number;
    biome: string;
    zone: string;
    mobs: string[];
}

/** Sorting by distance to the middle of the view moves in steps, so that panning does not reorder the list every frame. */
const SORT_STEP = 128;
const MAX_MOBS_SHOWN = 12;

const session = useSession();
const game = useGameData();
const { filters, toggle: toggleFilter, setAll: setAllFilters } = useMarkerFilters();

const search = ref('');
const selected = ref<PlaceDetails | null>(null);
const completed = ref<Set<string>>(new Set());
const hideCompleted = ref(readStorage(STORAGE_KEYS.hideDone) === '1');

const worldKey = () => session.world.value?.cacheKey ?? session.world.value?.id ?? '';

const places = computed<Place[]>(() => {
    const list = session.liveMarkers.value.length ? session.liveMarkers.value : (session.world.value?.markers ?? []);
    return list.map((m) => ({ ...m, category: getMarkerCategory(m), iconUrl: markerIconUrl(m) }));
});

const counts = computed(() => {
    const result = Object.fromEntries(CATEGORY_CHIPS.map((c) => [c.key, 0])) as Record<MarkerCategory, number>;
    for (const p of places.value) if (p.category in result) result[p.category as MarkerCategory]++;
    return result;
});

/** The chips worth showing: categories that have places, and any switched off so they can be switched back on. */
const chips = computed(() => CATEGORY_CHIPS.filter((c) => counts.value[c.key] > 0 || !filters.value[c.key]));

const list = computed(() => {
    const cx = Math.round(session.centre.value.x / SORT_STEP) * SORT_STEP;
    const cz = Math.round(session.centre.value.z / SORT_STEP) * SORT_STEP;
    const query = search.value.trim().toLowerCase();
    return places.value
        .filter((p) => {
            if (p.category === 'commonMobs' || !filters.value[p.category]) return false;
            if (hideCompleted.value && completed.value.has(p.id)) return false;
            return (
                !query ||
                (p.name ?? '').toLowerCase().includes(query) ||
                chipLabel(p.category).toLowerCase().includes(query)
            );
        })
        .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
});

function persistCompleted() {
    writeStorage(STORAGE_KEYS.done(worldKey()), JSON.stringify([...completed.value]));
    session.map.value?.setCompleted(completed.value, hideCompleted.value);
}

function toggleDone(id: string) {
    const next = new Set(completed.value);
    if (!next.delete(id)) next.add(id);
    completed.value = next;
    persistCompleted();
}

function setHideCompleted(on: boolean) {
    hideCompleted.value = on;
    writeStorage(STORAGE_KEYS.hideDone, on ? '1' : '0');
    session.map.value?.setCompleted(completed.value, on);
}

function exportCsv() {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = list.value.map((p) =>
        [
            quote(p.name ?? ''),
            chipLabel(p.category),
            Math.round(p.x),
            Math.round(p.z),
            completed.value.has(p.id) ? 'yes' : 'no'
        ].join(',')
    );
    const csv = ['name,category,x,z,done', ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${session.world.value?.name ?? 'places'}.csv`);
}

function placeAt(marker: MapMarker): PlaceDetails {
    const world = session.world.value;
    const spawn = world?.config.spawn;
    const category = getMarkerCategory(marker);
    let biome = '';
    let zone = '';
    const gen = game.worldGen();
    if (gen && world?.config.seed !== undefined) {
        try {
            const column = gen
                .forSeed(seed32(world.config.seed))
                .zoneBiomeAt(Math.round(marker.x), Math.round(marker.z));
            biome = column.biome?.name.replace(/_/g, ' ') ?? '';
            zone = column.zone?.name.replace(/_/g, ' ') ?? '';
        } catch {
            // a column the generator cannot place simply has no biome to show
        }
    }
    const npcs = (marker.spawns ?? []).flatMap((m: string) => game.spawns.value?.markerNpcs(m) ?? []);
    return {
        ...marker,
        category,
        iconUrl: markerIconUrl(marker),
        description: placeDescription(marker),
        distance: spawn ? Math.round(Math.hypot(marker.x - spawn.x, marker.z - spawn.z)) : 0,
        biome,
        zone,
        mobs: [...new Set(npcs)].map((n) => n.replace(/_/g, ' ')).slice(0, MAX_MOBS_SHOWN)
    };
}

function select(marker: MapMarker) {
    selected.value = placeAt(marker);
    session.map.value?.setSelected(marker.id);
}

function closeDetails() {
    selected.value = null;
    session.map.value?.setSelected(null);
}

// What was marked done in this world, and the filters, belong to the map being shown.
watch(session.map, (map) => {
    if (!map) return;
    try {
        completed.value = new Set(JSON.parse(readStorage(STORAGE_KEYS.done(worldKey())) ?? '[]'));
    } catch {
        completed.value = new Set();
    }
    map.setCompleted(completed.value, hideCompleted.value);
    selected.value = null;
});
watch(filters, (value) => session.map.value?.setOptions({ markerFilters: value }));
session.onMarkerClick(select);

export function usePlaces() {
    return {
        filters,
        search,
        selected,
        completed,
        hideCompleted,
        places,
        counts,
        chips,
        list,
        toggleFilter,
        setAllFilters,
        toggleDone,
        setHideCompleted,
        exportCsv,
        select,
        closeDetails,
        categoryLabel: (category: string) =>
            t(CATEGORY_CHIPS.find((c) => c.key === category)?.label ?? categoryName(category))
    };
}
