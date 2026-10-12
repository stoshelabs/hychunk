import { computed, ref, shallowRef } from 'vue';
import { loadWorldGen, makeSpawns, memorySource } from '@hychunk/worldgen';
import { loadGameData, loadGameVersions, type GameData, type GameVersion } from '../gameData';
import { messageOf } from '../lib/errors';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';

type GameState = 'loading' | 'ready' | 'error';

const state = ref<GameState>('loading');
const error = ref('');
const versions = ref<GameVersion[]>([]);
const data = shallowRef<GameData | null>(null);
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

async function select(id: string) {
    state.value = 'loading';
    error.value = '';
    try {
        data.value = await loadGameData(id);
        writeStorage(STORAGE_KEYS.gameVersion, id);
        state.value = 'ready';
    } catch (e) {
        error.value = messageOf(e);
        state.value = 'error';
    }
}

/** Picks the version asked for in the address, else the one used last time, else the latest. */
async function init() {
    try {
        const index = await loadGameVersions();
        versions.value = index.versions;
        const known = (id: string | null) => (id && index.versions.some((v) => v.id === id) ? id : null);
        const asked = known(new URLSearchParams(location.search).get('gv'));
        await select(asked ?? known(readStorage(STORAGE_KEYS.gameVersion)) ?? index.latest);
    } catch (e) {
        error.value = messageOf(e);
        state.value = 'error';
    }
}

/** Resolves once the data packs are in or have failed: a seed map needs them to know where its spawn is. */
async function whenSettled() {
    while (state.value === 'loading') await new Promise((resolve) => setTimeout(resolve, 80));
}

export function useGameData() {
    return { state, error, versions, data, spawns, versionId, worldGen, select, init, whenSettled };
}
