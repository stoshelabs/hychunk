import { computed, ref, shallowRef } from 'vue';
import { loadWorldGen, makeSpawns, memorySource } from '@hychunk/worldgen';
import {
    loadBlockNames,
    loadGameData,
    loadGameVersions,
    loadPortals,
    type GameData,
    type GameVersion,
    type PortalTable
} from '../gameData';
import { messageOf } from '../lib/errors';

type GameState = 'loading' | 'ready' | 'error';

const state = ref<GameState>('loading');
const error = ref('');
const versions = ref<GameVersion[]>([]);
const data = shallowRef<GameData | null>(null);
const portals = shallowRef<PortalTable | null>(null);
const spawns = computed(() => (data.value ? makeSpawns(data.value.spawns) : null));
const versionId = computed(() => data.value?.id ?? '');

let generator: { source: GameData; value: ReturnType<typeof loadWorldGen> } | null = null;

/** Loading the generator reads every biome file, so it is done once per game version. */
function worldGen() {
    if (!data.value) return null;
    if (generator?.source !== data.value) {
        generator = { source: data.value, value: loadWorldGen(memorySource(data.value.worldgen as never)) };
    }
    return generator.value;
}

/** Writes the game version into the address (`?gv=`), next to whatever else is there, so a link opens the same version. */
function writeVersionToAddress(id: string) {
    const params = new URLSearchParams(location.search);
    params.set('gv', id);
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
}

/** Loads the data of a game version. The address follows unless `address` is false (the default version on first load keeps it clean). */
async function select(id: string, address = true) {
    state.value = 'loading';
    error.value = '';
    try {
        data.value = await loadGameData(id);
        portals.value = await loadPortals(id);
        if (address) writeVersionToAddress(id);
        state.value = 'ready';
    } catch (e) {
        error.value = messageOf(e);
        state.value = 'error';
    }
}

/** Picks the version asked for in the address, else the latest: a plain visit always opens the newest game version. */
async function init() {
    try {
        const index = await loadGameVersions();
        versions.value = index.versions;
        const known = (id: string | null) => (id && index.versions.some((v) => v.id === id) ? id : null);
        const asked = known(new URLSearchParams(location.search).get('gv'));
        await select(asked ?? index.latest, asked !== null);
    } catch (e) {
        error.value = messageOf(e);
        state.value = 'error';
    }
}

/** Resolves once the data packs are in or have failed: a seed map needs them to know where its spawn is. */
async function whenSettled() {
    while (state.value === 'loading') await new Promise((resolve) => setTimeout(resolve, 80));
}

/** The block names of a game version, kept after the first read. */
const blockNames = new Map<string, Promise<Set<string>>>();
const blocksOf = (id: string) => {
    let p = blockNames.get(id);
    if (!p) blockNames.set(id, (p = loadBlockNames(id)));
    return p;
};

export function useGameData() {
    return {
        state,
        error,
        versions,
        data,
        portals,
        spawns,
        versionId,
        worldGen,
        select,
        init,
        whenSettled,
        blocksOf,
        writeVersionToAddress
    };
}
