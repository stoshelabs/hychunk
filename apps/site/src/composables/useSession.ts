import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import {
    createWorkerPool,
    defaultPoolSize,
    fromUrl,
    inspectSave,
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
import { instanceUrl } from '../gameData';
import { createStructureSource } from '../structures';
import { markerImage } from '../lib/assets';
import { downloadBlob } from '../lib/download';
import { messageOf } from '../lib/errors';
import { t } from '../lib/i18n';
import { pickVersion, type Detected } from '../lib/saveVersion';
import { parseSeedValue, randomSeed, seed32 } from '../lib/seed';
import { useGameData } from './useGameData';
import { markerName, useGameText } from './useGameText';
import { useMarkerFilters } from './useMarkerFilters';
import { useToast } from './useToast';

type Layer = 'chunkGrid' | 'regionGrid' | 'spawn' | 'markers' | 'players' | 'terrain';

const FIRST_SCREEN_SHARE = 0.85;
const FIRST_SCREEN_MIN_MS = 500;
const FIRST_SCREEN_MAX_MS = 4000;
const STRUCTURE_WORKERS = 2;

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

/** An instance world (the Forgotten Temple) opened from a portal: its terrain is its own, so nothing is predicted around it. */
const INSTANCE = 'instance:';
const isInstance = (w: WorldData | null) => !!w?.id.startsWith(INSTANCE);
const inInstance = computed(() => isInstance(world.value));
/** The world a portal was taken from, and where in it, so the way back lands on the same view. */
const origin = shallowRef<{ world: WorldData; search: string; hash: string } | null>(null);

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
    if (!map.value || !world.value || !data || world.value.config.seed === undefined || isInstance(world.value)) return;
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
        markerLabel: markerName,
        markerIconUrl: markerImage,
        dataVersion: game.versionId.value,
        pool
    };
    const m = new WorldMap(canvas.value, next, options);
    map.value = m;
    m.setPredicted(!!data && !isInstance(next));
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

/** The game version the opened save was written by, when it could be told; `null` for a seed map. */
const savedBy = ref<Detected | null>(null);

/** A save does not name its game version, so it is told from the chunks (see `pickVersion`), and the map switches to that version's data. */
async function adoptSaveVersion(next: WorldData) {
    savedBy.value = null;
    try {
        await game.whenSettled();
        const found = await pickVersion(await inspectSave(next), game.versions.value, game.blocksOf);
        if (!found) return;
        savedBy.value = found;
        if (found.id !== game.versionId.value) await game.select(found.id);
        else game.writeVersionToAddress(found.id);
        const version = game.versions.value.find((v) => v.id === found.id)?.label ?? found.id;
        useToast().show(
            found.exact
                ? t('This save was written by {version}', { version })
                : t('This save is newer than the data here; using {version}', { version }),
            4500
        );
    } catch (e) {
        console.warn('Could not tell the game version of this save:', e);
    }
}

async function openFiles(files: File[], name?: string) {
    error.value = '';
    busy.value = true;
    origin.value = null;
    try {
        picked = files;
        worlds.value = listWorlds(files);
        const opened = await loadWorldFromFiles(files, name);
        await adoptSaveVersion(opened);
        await show(opened);
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

    savedBy.value = null;
    origin.value = null;
    const link = new URLSearchParams({ seed: String(seed) });
    if (game.versionId.value) link.set('gv', game.versionId.value);
    history.replaceState(null, '', `${location.pathname}?${link}${location.hash}`); // a shared link keeps its view

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
    if (isSeedWorld.value || inInstance.value) return openSeed(String(seed));
    world.value.config.seed = seed;
    world.value.cacheKey = `${world.value.id}|${world.value.name}|seed-${seed}`;
    await show(world.value);
}

async function rollSeed() {
    seedText.value = String(randomSeed());
    await (world.value && !isSeedWorld.value && !inInstance.value ? applySeed() : openSeed());
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
    const dev: WorldData = {
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
    };
    await adoptSaveVersion(dev);
    await show(dev);
}

/** Opens an instance world that a portal leads to, from the chunks the game version's pack holds. */
async function enterInstance(name: string) {
    const info = game.portals.value?.instances[name];
    const version = game.versionId.value;
    if (!info?.openable || !version) return;
    error.value = '';
    busy.value = true;
    try {
        const base = instanceUrl(version, name);
        const res = await fetch(`${base}/config.json`);
        if (!res.ok) throw new Error(`${name}: ${res.status}`);
        const config = parseWorldConfig(await res.json());
        const markers = parseMarkers(
            await fetch(`${base}/resources/BlockMapMarkers.json`)
                .then((r) => (r.ok ? r.json() : undefined))
                .catch(() => undefined)
        );
        const regions = info.regions
            .map((r) => parseRegionName(`${r}.region.bin`))
            .filter((r): r is { rx: number; rz: number } => !!r);
        const cache = new Map<string, Promise<RegionFile>>();
        const next: WorldData = {
            id: `${INSTANCE}${name}`,
            name: info.title,
            source: 'universe',
            config,
            markers,
            players: [],
            start: startPoint(config, [], regions),
            regions,
            regionSource: { kind: 'url', base: `${base}/chunks` },
            // `|2`: before 2 the chunks around the instance were drawn from the overworld generator and saved so
            cacheKey: `instance|${version}|${name}|2`,
            openRegion: (rx, rz) => {
                const key = `${rx}.${rz}`;
                if (!cache.has(key)) cache.set(key, fromUrl(`${base}/chunks/${key}.region.bin`).then(RegionFile.open));
                return cache.get(key)!;
            }
        };
        if (world.value && !isInstance(world.value))
            origin.value = { world: world.value, search: location.search, hash: location.hash };
        savedBy.value = null;
        history.replaceState(null, '', `${location.pathname}?${new URLSearchParams({ gv: version, instance: name })}`);
        await show(next);
        const at = config.spawn ?? next.start;
        if (at) map.value?.goTo(at.x, at.z, 2); // a new world opens on its spot; there is nothing to fly over
    } catch (e) {
        error.value = messageOf(e);
    } finally {
        busy.value = false;
    }
}

/** Back to the world a portal was taken from, on the view it had. */
async function leaveInstance() {
    const from = origin.value;
    if (!from) return;
    origin.value = null;
    history.replaceState(null, '', `${location.pathname}${from.search}${from.hash}`);
    await show(from.world);
}

function setLayer(layer: Layer, on: boolean) {
    layers.value = { ...layers.value, [layer]: on };
    map.value?.setOptions({ [layer]: on });
}

/** Flies the view to a block position (see `WorldMap.flyTo`): a click on a place or a player carries the map there. */
function goTo(x: number, z: number, scale = 3) {
    map.value?.flyTo(x, z, scale);
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

// Another language for the game's texts: the labels on the map are drawn again.
const gameTexts = useGameText();
watch(gameTexts.revision, () => map.value?.setOptions({ markerLabel: (m) => markerName(m) }));

// A new game version: the workers, the colours and the structures all depend on its data.
watch(game.data, (data) => {
    if (!data) return;
    if (pool) configurePool(pool);
    if (map.value && world.value) {
        map.value.setMapStyle(data.style, data.id);
        map.value.setPredicted(!inInstance.value);
        map.value.reloadTiles();
        startStructures();
    }
});

watch(
    game.state,
    (state) => {
        if (state === 'ready') {
            const seed = new URLSearchParams(location.search).get('seed');
            const instance = new URLSearchParams(location.search).get('instance');
            if (instance && !world.value) void enterInstance(instance);
            else if (seed && !world.value) void openSeed(seed);
        }
    },
    { once: true }
);

if (import.meta.env.DEV) (window as unknown as { __session: unknown }).__session = { firstScreen, map, world }; // for timing runs

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
        inInstance,
        origin,
        enterInstance,
        leaveInstance,
        savedBy,
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
