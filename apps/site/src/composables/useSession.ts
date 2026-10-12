import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import {
    createWorkerPool,
    defaultPoolSize,
    fromUrl,
    listWorlds,
    loadWorldFromFiles,
    parseMarkers,
    parseRegionName,
    parseWorldConfig,
    RegionFile,
    startPoint,
    type ChunkPool,
    type MapMarker,
    type WorldData,
    type WorldEntry
} from '@hychunk/core';
import {
    clearCache,
    formatView,
    parseCoordinates,
    parseView,
    WorldMap,
    type HoverInfo,
    type MapOptions
} from '@hychunk/map';
import { createStructureSource } from '../structures';
import { downloadBlob } from '../lib/download';
import { messageOf } from '../lib/errors';
import { parseSeedValue, randomSeed, seed32 } from '../lib/seed';
import { useGameData } from './useGameData';
import { useMarkerFilters } from './useMarkerFilters';

type Layer = 'chunkGrid' | 'regionGrid' | 'spawn' | 'markers' | 'players' | 'playerSkins' | 'terrain';

const FIRST_SCREEN_SHARE = 0.97;
const FIRST_SCREEN_MIN_MS = 1200;
const FIRST_SCREEN_MAX_MS = 25000;
const STRUCTURE_WORKERS = 3;

const game = useGameData();
const { filters } = useMarkerFilters();

const canvas = shallowRef<HTMLCanvasElement | null>(null);
const world = shallowRef<WorldData | null>(null);
const map = shallowRef<WorldMap | null>(null);
const worlds = ref<WorldEntry[]>([]);
const liveMarkers = shallowRef<MapMarker[]>([]);
const layers = ref<Record<Layer, boolean>>({
    chunkGrid: true,
    regionGrid: true,
    spawn: true,
    markers: true,
    players: true,
    playerSkins: true,
    terrain: true
});

const error = ref('');
const busy = ref(false);
const hover = ref<HoverInfo | null>(null);
const pending = ref(0);
const centre = ref({ x: 0, z: 0 });
const seedText = ref(String(randomSeed()));
const measuring = ref(false);
const measureText = ref('');
const firstScreen = ref({ settled: false, percent: 0 });

const isSeedWorld = computed(() => !!world.value?.id.startsWith('seed-'));

let pool: ChunkPool | null = null;
let picked: File[] = [];
let settleTimer = 0;
const markerClickListeners: ((marker: MapMarker) => void)[] = [];

function configurePool(target: ChunkPool) {
    const data = game.data.value;
    target.configure('terrain', layers.value.terrain);
    if (!data) return;
    target.configure('mapStyle', data.style);
    target.configure('prefabTable', data.prefabs);
    target.configure('prefabTops', data.tops);
    target.configure('worldGenFiles', data.worldgen);
}

/** The generator's structures for this world: for a save the chunks it never visited, for a bare seed everything. */
function startStructures() {
    const data = game.data.value;
    if (!map.value || !world.value || !data || world.value.config.seed === undefined) return;
    try {
        const source = createStructureSource(
            data.worldgen,
            data.prefabs,
            seed32(world.value.config.seed),
            STRUCTURE_WORKERS
        );
        map.value.setStructures(source, STRUCTURE_WORKERS);
    } catch (e) {
        console.warn('Could not start the structure workers:', e);
    }
}

function watchFirstScreen() {
    firstScreen.value = { settled: false, percent: 0 };
    window.clearInterval(settleTimer);
    const started = performance.now();
    settleTimer = window.setInterval(() => {
        if (!map.value) return;
        const elapsed = performance.now() - started;
        const progress = map.value.progress();
        firstScreen.value = { settled: false, percent: Math.round(progress * 100) };
        if ((elapsed > FIRST_SCREEN_MIN_MS && progress >= FIRST_SCREEN_SHARE) || elapsed > FIRST_SCREEN_MAX_MS) {
            firstScreen.value = { settled: true, percent: 100 };
            window.clearInterval(settleTimer);
        }
    }, 200);
}

function bindMap(m: WorldMap) {
    m.on('markers', (list) => (liveMarkers.value = list));
    m.on('markerClick', (marker) => markerClickListeners.forEach((fn) => fn(marker)));
    m.on('hover', (h) => (hover.value = h));
    m.on('loading', (l) => (pending.value = l.pending));
    m.on('measure', (r) => {
        const sign = (n: number) => (n > 0 ? '+' : '');
        measureText.value = r
            ? `${Math.round(r.distance)} blocks (x ${sign(r.dx)}${r.dx}, z ${sign(r.dz)}${r.dz})`
            : '';
    });
    let timer = 0;
    m.on('view', (v) => {
        centre.value = { x: Math.round(v.x), z: Math.round(v.z) };
        window.clearTimeout(timer);
        timer = window.setTimeout(() => history.replaceState(null, '', `#${formatView(v)}`), 300);
    });
}

async function show(next: WorldData) {
    seedText.value = String(next.config.seed);
    map.value?.destroy();
    map.value = null;
    pool?.destroy();
    pool = createWorkerPool(
        next.regionSource,
        () => new Worker(new URL('../chunk.worker.ts', import.meta.url), { type: 'module' }),
        defaultPoolSize()
    );
    pool.configure('config', next.config);
    configurePool(pool);
    world.value = next;
    liveMarkers.value = [...next.markers];
    await nextTick();
    if (!canvas.value) return;

    const data = game.data.value;
    const options: MapOptions = {
        ...layers.value,
        markerFilters: filters.value,
        styled: !!data,
        dataVersion: game.versionId.value,
        pool
    };
    const m = new WorldMap(canvas.value, next, options);
    map.value = m;
    m.setPredicted(!!data);
    startStructures();
    bindMap(m);
    liveMarkers.value = m.getVisibleMarkers();
    measuring.value = false;
    measureText.value = '';
    watchFirstScreen();

    const linked = parseView(location.hash);
    if (linked) m.goTo(linked.x, linked.z, linked.scale);
    if (__DEV_WORLD__) (window as unknown as { __map: WorldMap }).__map = m;
}

async function openFiles(files: File[], name?: string) {
    error.value = '';
    busy.value = true;
    try {
        picked = files;
        worlds.value = listWorlds(files);
        await show(await loadWorldFromFiles(files, name));
    } catch (e) {
        error.value = messageOf(e);
    } finally {
        busy.value = false;
    }
}

/** Opens another world among the ones found in the folder already picked. */
const openPickedWorld = (id: string) => openFiles(picked, id);

async function openSeed(text = seedText.value) {
    await game.whenSettled();
    const seed = parseSeedValue(text || String(randomSeed()));
    seedText.value = String(seed);

    // The spawn room is the generator's own, so a seed map opens there.
    let start = { x: 0, z: 0, label: 'Origin' };
    const gen = game.worldGen();
    if (gen) {
        try {
            const room = gen
                .forSeed(seed)
                .uniquePrefabs()
                .find((p) => p.isSpawn);
            if (room) start = { x: room.x, z: room.z, label: room.name };
        } catch (e) {
            console.warn('Could not place the spawn for this seed:', e);
        }
    }

    const link = new URLSearchParams({ seed: String(seed) });
    if (game.versionId.value) link.set('gv', game.versionId.value);
    history.replaceState(null, '', `${location.pathname}?${link}`);

    await show({
        id: `seed-${seed}`,
        name: `Seed ${seed}`,
        source: 'universe',
        config: {
            seed,
            spawn: { x: start.x, y: 70, z: start.z, yaw: 0 },
            worldGen: 'Default',
            worldGenType: 'Hytale',
            requiredPlugins: [],
            chunkStorage: 'Hytale'
        },
        markers: [],
        players: [],
        start,
        regions: [],
        regionSource: { kind: 'blobs', files: {} },
        cacheKey: `seed|${seed}`,
        openRegion: () => Promise.reject(new Error('A seed map has no region files'))
    });
}

/** Applies the seed typed in the sidebar: a seed map is regenerated, a save is drawn with the other seed. */
async function applySeed() {
    if (!world.value) return;
    const seed = parseSeedValue(seedText.value);
    seedText.value = String(seed);
    if (isSeedWorld.value) return openSeed(String(seed));
    world.value.config.seed = seed;
    world.value.cacheKey = `${world.value.id}|${world.value.name}|seed-${seed}`;
    await show(world.value);
}

async function rollSeed() {
    seedText.value = String(randomSeed());
    await (world.value && !isSeedWorld.value ? applySeed() : openSeed());
}

/** Development only: a world served over HTTP by the Vite plugin (see vite.config.ts). */
async function openDevWorld() {
    const base = '/__world';
    const names = (await (await fetch(`${base}/index.json`)).json()) as string[];
    const regions = names.map(parseRegionName).filter((r): r is { rx: number; rz: number } => !!r);
    const config = parseWorldConfig(await (await fetch(`${base}/config.json`)).json());
    const markers = parseMarkers(
        await fetch(`${base}/resources/BlockMapMarkers.json`)
            .then((r) => r.json())
            .catch(() => undefined)
    );
    const cache = new Map<string, Promise<RegionFile>>();
    await show({
        id: 'dev/',
        name: 'dev',
        source: 'universe',
        config,
        markers,
        players: [],
        start: startPoint(config, [], regions),
        regions,
        regionSource: { kind: 'url', base: new URL(`${base}/chunks`, location.href).href },
        cacheKey: null,
        openRegion: (rx, rz) => {
            const key = `${rx}.${rz}`;
            if (!cache.has(key)) cache.set(key, fromUrl(`${base}/chunks/${key}.region.bin`).then(RegionFile.open));
            return cache.get(key)!;
        }
    });
}

function setLayer(layer: Layer, on: boolean) {
    layers.value = { ...layers.value, [layer]: on };
    map.value?.setOptions({ [layer]: on });
}

function goTo(x: number, z: number, scale = 3) {
    map.value?.goTo(x, z, scale);
}

function goToSpawn() {
    const spawn = world.value?.config.spawn ?? world.value?.start;
    if (spawn) goTo(spawn.x, spawn.z, 2);
}

/** Moves to typed coordinates ("120 -45"); returns false when the text is not two numbers. */
function goToText(text: string) {
    const c = parseCoordinates(text);
    if (c) goTo(c.x, c.z);
    return !!c;
}

function toggleMeasure() {
    measuring.value = !measuring.value;
    map.value?.setMeasure(measuring.value);
}

async function savePng() {
    if (!map.value) return;
    try {
        downloadBlob(await map.value.toBlob(), `${world.value?.name ?? 'map'}.png`);
    } catch (e) {
        error.value = messageOf(e);
    }
}

const onMarkerClick = (fn: (marker: MapMarker) => void) => markerClickListeners.push(fn);

function attachCanvas(el: HTMLCanvasElement | null) {
    canvas.value = el;
}

function dispose() {
    window.clearInterval(settleTimer);
    map.value?.destroy();
    pool?.destroy();
}

// A new game version: the workers, the colours and the structures all depend on its data.
watch(game.data, (data) => {
    if (!data) return;
    if (pool) configurePool(pool);
    if (map.value && world.value) {
        map.value.setMapStyle(data.style, data.id);
        map.value.setPredicted(true);
        map.value.reloadTiles();
        startStructures();
    }
});

watch(
    game.state,
    (state) => {
        if (state === 'ready') {
            const seed = new URLSearchParams(location.search).get('seed');
            if (seed && !world.value) void openSeed(seed);
        }
    },
    { once: true }
);

export function useSession() {
    return {
        world,
        map,
        worlds,
        liveMarkers,
        layers,
        error,
        busy,
        hover,
        pending,
        centre,
        seedText,
        measuring,
        measureText,
        firstScreen,
        isSeedWorld,
        attachCanvas,
        openFiles,
        openPickedWorld,
        openSeed,
        applySeed,
        rollSeed,
        openDevWorld,
        setLayer,
        goTo,
        goToSpawn,
        goToText,
        toggleMeasure,
        savePng,
        onMarkerClick,
        clearCache,
        dispose
    };
}
