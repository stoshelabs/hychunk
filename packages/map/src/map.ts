import {
    chunkOf,
    COLORS_VERSION,
    createInlinePool,
    playerColor,
    PoiGenerator,
    REGION_SIZE,
    RENDER_VERSION,
    type ChunkPool,
    type MarkerStore,
    type StructureSource,
    type MapMarker,
    type MapStyle,
    type TileResult,
    type WorldData
} from '@hychunk/core';
import { planFlight, type Flight } from './fly';
import { markerIconName } from './markers';
import { loadMarkerCells, loadOverview, loadPredicted, saveMarkerCells, saveOverview, savePredicted } from './cache';
import { Overview } from './overview';
import { TileCache } from './tilecache';
import { ScanQueue } from './scan';

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

export interface MapOptions {
    /** What a marker is called on the map, when that is not its own `name` (the app translates it). */
    markerLabel?: (m: MapMarker) => string;
    /** Where a marker icon's picture is, by icon name; `/markers/<name>.png` unless the site is served from a sub-path. */
    markerIconUrl?: (name: string) => string;
    chunkGrid: boolean;
    regionGrid: boolean;
    spawn: boolean;
    markers: boolean;
    players: boolean;
    /** Faces from the skin service (api.hytl.skin, which is sent the players' ids) instead of plain pins. */
    playerSkins?: boolean;
    terrain: boolean;
    /** Colours come from the person's game files (block and water tints) rather than the built-in table; set with `setMapStyle`. */
    styled?: boolean;
    /** The game version of the data packs the generator reads; part of what the saved tiles are keyed by. */
    dataVersion?: string;
    markerFilters: MarkerFilters;
    /** Decodes chunks off the main thread; without it they are decoded on it, one at a time. */
    pool?: ChunkPool;
}

export interface HoverInfo {
    /** Block coordinates under the pointer. */
    x: number;
    z: number;
    chunkX: number;
    chunkZ: number;
    regionX: number;
    regionZ: number;
    /** Whether that chunk exists in the save. */
    explored: boolean;
}

export interface MapEvents {
    hover: HoverInfo | null;
    view: { x: number; z: number; scale: number };
    /** The measured segment, or null when there is none; `distance` is in blocks. */
    measure: { dx: number; dz: number; distance: number } | null;
    loading: { pending: number; loaded: number; damaged: number };
    markers: MapMarker[];
    markerClick: MapMarker;
}

export interface MarkerClusterNode {
    x: number;
    z: number;
    screenX: number;
    screenY: number;
    markers: MapMarker[];
}

export interface SpiderfyDroplet {
    marker: MapMarker;
    targetOffsetX: number;
    targetOffsetY: number;
    currentOffsetX: number;
    currentOffsetY: number;
    angle: number;
    distance: number;
}

export interface SpiderfyState {
    cluster: MarkerClusterNode;
    worldX: number;
    worldZ: number;
    droplets: SpiderfyDroplet[];
    startTime: number;
    duration: number;
    collapsing: boolean;
    collapseStartTime: number;
    collapseDuration: number;
    accentColor: string;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 32;
/** Bump when the structures a square holds change (what is searched, how they are named), so saved squares are not reused. */
const STRUCTURES_VERSION = 5;
/** How long a tile of a predicted chunk waits for the trees, rocks and plants of its squares before it is drawn without them. */
const DECOR_WAIT_MS = 700;
/** How long a read of the browser's cache may take before the chunk is drawn without it. */
const CACHE_WAIT_MS = 1500;

/** A tree, rock or plant spot (`SiteShape` of the generator), as handed between threads. */
interface DecorSite {
    x: number;
    y: number;
    z: number;
    name: string;
    rotation: number;
    footprint: [number, number, number, number];
}
const MAX_TILES = 3000;
/** Chunks smaller than this on screen are drawn from the overview alone. */
const DETAIL_MIN_PX = 12;
const MAX_DETAIL_VISIBLE = 6000;

type Tile = HTMLCanvasElement | ImageBitmap | null; // null: the save has no such chunk
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
const floorDiv = (a: number, b: number) => Math.floor(a / b);

export class WorldMap {
    options: Omit<MapOptions, 'pool'> = {
        chunkGrid: true,
        regionGrid: true,
        spawn: true,
        markers: true,
        players: true,
        terrain: false,
        markerFilters: {
            spawns: true,
            temples: true,
            dungeons: true,
            uncommonMobs: true,
            farms: true,
            portals: true,
            prefabs: true,
            challenges: true,
            encounters: true,
            camps: true,
            user: true
        }
    };
    /** Centre of the view in block coordinates, and pixels per block. */
    view = { x: 0, z: 0, scale: 1 };

    private ctx: CanvasRenderingContext2D;
    private tiles = new Map<string, Tile>();
    private queue: { cx: number; cz: number }[] = [];
    private queued = new Set<string>();
    /** One pixel per chunk, one 32×32 canvas per region: what is drawn when zoomed far out. */
    private overview = new Overview();
    private scanQueue = new ScanQueue();
    private saveTimer = 0;
    private dirtyOverview = false;
    private existing = new Set<string>();
    private explored: { cx: number; cz: number }[] = [];
    /** Chunks whose real colour is in the overview. */
    private done = new Set<string>();
    private loaded = 0;
    private _dirty = true;
    private get dirty() {
        return this._dirty;
    }
    private set dirty(val: boolean) {
        this._dirty = val;
        if (val) this.requestFrame();
    }
    private frameRequested = false;
    private raf = 0;
    private dpr = 1;
    private listeners: Record<string, ((v: any) => void)[]> = {};
    private pointers = new Map<number, { x: number; y: number }>();
    private pinch = 0;
    private dead = false;
    /** Pan speed in blocks per second, smoothed, so loading can run ahead of where the view is going. */
    private velocity = { x: 0, z: 0, at: 0 };
    private lastMove = { x: 0, z: 0, at: 0 };
    private rectKey = '';
    private active = true;
    private off: (() => void)[] = [];
    private measuring = false;
    private ruler: { x: number; z: number }[] = [];
    private downAt: { x: number; y: number } | null = null;
    private mousePos: { x: number; y: number } | null = null;
    private currentHit: { cluster?: MarkerClusterNode; marker?: MapMarker; isSpiderfyOrigin?: boolean } | null = null;
    private lastEmittedMarkers: MapMarker[] | null = null;
    private spiderfy: SpiderfyState | null = null;
    private smoothCam: {
        startX: number;
        startZ: number;
        startScale: number;
        targetX: number;
        targetZ: number;
        targetScale: number;
        startTime: number;
        duration: number;
    } | null = null;

    /** A fly-to under way (`flyTo`): the path and when it began. */
    private flight: { path: Flight; startTime: number; to: { x: number; z: number; scale: number } } | null = null;

    private pool: ChunkPool;
    private ownPool: boolean;
    private inflight = 0;
    private tileCache: TileCache;
    private damaged = new Set<string>();
    poiGenerator: PoiGenerator;

    constructor(
        readonly canvas: HTMLCanvasElement,
        readonly world: WorldData,
        options: Partial<MapOptions> = {}
    ) {
        const { pool, ...rest } = options;
        Object.assign(this.options, rest);
        this.ownPool = !pool;
        this.pool = pool ?? createInlinePool(world.regionSource);
        this.tileCache = new TileCache(this.cacheKey);
        const seedNum = Number(BigInt.asIntN(32, BigInt(world.config.seed ?? 0)));
        this.poiGenerator = new PoiGenerator(seedNum);
        this.ctx = canvas.getContext('2d', { alpha: false })!;
        this.bind();
        this.resize();
        // Open on the player or the spawn, close enough to see terrain, and let the overview fill in around it.
        this.goTo(world.start.x, world.start.z, 1.5);
        this.loop();
        void this.indexRegions();
        this.emit('markers', this.getVisibleMarkers());
    }

    /** Structures the generator places (spawn room, temple, monuments), for the seed of this world; worked out wherever `source` runs. */
    setStructures(source: StructureSource, parallel = 1) {
        const seedNum = Number(BigInt.asIntN(32, BigInt(this.world.config.seed ?? 0)));
        this.poiGenerator.dispose();
        this.markerMemo = null;
        // what depends on the world and the game version, not on how it is drawn: the structures of a square stay valid across visits
        const key = this.world.cacheKey
            ? `${this.world.cacheKey}|g${this.options.dataVersion ?? ''}|s${STRUCTURES_VERSION}`
            : null;
        const store: MarkerStore | undefined = key
            ? { load: () => loadMarkerCells(key), save: (cells) => void saveMarkerCells(key, cells) }
            : undefined;
        // squares arrive many a second when zoomed out: the map redraws at once, the list outside is told a few times a second
        let notify: ReturnType<typeof setTimeout> | null = null;
        this.poiGenerator = new PoiGenerator(
            seedNum,
            source,
            () => {
                this.dirty = true;
                if (notify !== null) return;
                notify = setTimeout(() => {
                    notify = null;
                    if (!this.dead) this.emit('markers', this.getVisibleMarkers());
                }, 300);
            },
            parallel,
            store
        );
        this.dirty = true;
        this.emit('markers', this.getVisibleMarkers());
    }

    private markerMemo: {
        key: string;
        rect: { c0: number; r0: number; c1: number; r1: number };
        list: MapMarker[];
    } | null = null;

    /** Returns all markers and POIs across the visible viewport and unrendered chunks (the same array until the view leaves its margin or markers change). */
    getVisibleMarkers(): MapMarker[] {
        const v = this.visibleChunks();
        const key = `${this.poiGenerator.revision}|${this.world.markers.length}|${this.poiGenerator.seed}`;
        const m = this.markerMemo;
        if (
            m &&
            m.key === key &&
            v.c0 >= m.rect.c0 + 6 &&
            v.r0 >= m.rect.r0 + 6 &&
            v.c1 <= m.rect.c1 - 6 &&
            v.r1 <= m.rect.r1 - 6
        )
            return m.list;
        const pad = 14;
        const rect = { c0: v.c0 - pad, r0: v.r0 - pad, c1: v.c1 + pad, r1: v.r1 + pad };
        const generated = this.poiGenerator.getMarkersInRect(
            rect.c0 * 32,
            rect.r0 * 32,
            (rect.c1 + 1) * 32,
            (rect.r1 + 1) * 32
        );
        const combined = [...this.world.markers];
        // what the world already marks (the save's own markers) wins over what the generator says is there; a grid keeps this linear
        const grid = new Map<string, MapMarker[]>();
        for (const w of this.world.markers) {
            const k = `${Math.floor(w.x / 80)},${Math.floor(w.z / 80)}`;
            (grid.get(k) ?? grid.set(k, []).get(k)!).push(w);
        }
        const near = (g: MapMarker) => {
            const gx = Math.floor(g.x / 80),
                gz = Math.floor(g.z / 80);
            for (let dz = -1; dz <= 1; dz++)
                for (let dx = -1; dx <= 1; dx++) {
                    for (const w of grid.get(`${gx + dx},${gz + dz}`) ?? [])
                        if (Math.hypot(w.x - g.x, w.z - g.z) < 80) return true;
                }
            return false;
        };
        // the generator's spawn room is the world's spawn when they coincide: one marker, the one called Spawn
        const sp = this.world.config.spawn;
        for (const g of generated) {
            if (near(g)) continue;
            combined.push(
                sp && g.icon === 'Spawn' && Math.hypot(g.x - sp.x, g.z - sp.z) < 150 ? { ...g, name: 'Spawn' } : g
            );
        }
        this.markerMemo = { key, rect, list: combined };
        return combined;
    }

    on<K extends keyof MapEvents>(event: K, fn: (v: MapEvents[K]) => void): () => void {
        (this.listeners[event] ??= []).push(fn);
        return () => {
            this.listeners[event] = this.listeners[event]!.filter((f) => f !== fn);
        };
    }
    private emit<K extends keyof MapEvents>(event: K, v: MapEvents[K]) {
        this.listeners[event]?.forEach((f) => f(v));
    }

    /** Pauses drawing and background loading while the map is hidden (for example behind the 3D view). */
    setActive(active: boolean) {
        if (this.active === active) return;
        this.active = active;
        if (active) {
            this.resize();
            this.dirty = true;
            this.pump();
        } else {
            if (this.raf) {
                cancelAnimationFrame(this.raf);
                this.raf = 0;
                this.frameRequested = false;
            }
        }
    }

    private requestFrame() {
        if (this.frameRequested || this.dead || !this.active) return;
        this.frameRequested = true;
        this.raf = requestAnimationFrame(this.loop);
    }

    private createTile(pixels: Uint8ClampedArray): Promise<Tile> {
        if (typeof createImageBitmap !== 'undefined') {
            const imgData = new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, 32, 32);
            return createImageBitmap(imgData);
        }
        const tile = document.createElement('canvas');
        tile.width = tile.height = 32;
        tile.getContext('2d')!.putImageData(
            new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, 32, 32),
            0,
            0
        );
        return Promise.resolve(tile);
    }

    private createRegionCanvas(pixels: Uint8ClampedArray): Promise<HTMLCanvasElement | ImageBitmap> {
        if (typeof createImageBitmap !== 'undefined') {
            const imgData = new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, REGION_SIZE, REGION_SIZE);
            return createImageBitmap(imgData);
        }
        const c = document.createElement('canvas');
        c.width = c.height = REGION_SIZE;
        c.getContext('2d')!.putImageData(
            new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, REGION_SIZE, REGION_SIZE),
            0,
            0
        );
        return Promise.resolve(c);
    }

    private closeTile(tile: Tile | HTMLCanvasElement | ImageBitmap | undefined) {
        if (tile && typeof (tile as ImageBitmap).close === 'function') {
            (tile as ImageBitmap).close();
        }
    }

    setOptions(o: Partial<Omit<MapOptions, 'pool'>>) {
        const terrainChanged = o.terrain !== undefined && o.terrain !== this.options.terrain;
        if (o.markerFilters) {
            this.options.markerFilters = { ...this.options.markerFilters, ...o.markerFilters };
            delete (o as any).markerFilters;
        }
        Object.assign(this.options, o);
        if (terrainChanged) {
            this.pool.configure('terrain', this.options.terrain);
            this.redrawAll();
        }
        this.dirty = true;
    }

    /** Colour the map from the game's own files (or back to the built-in table with `null`) and draw every tile again. */
    setMapStyle(style: MapStyle | null, dataVersion = this.options.dataVersion ?? '') {
        this.options.dataVersion = dataVersion;
        this.pool.configure('mapStyle', style ?? undefined);
        this.options.styled = style !== null;
        this.redrawAll();
        this.dirty = true;
    }

    /** Starts over with what is on screen: after the generator's files arrive, the chunks no save has can be drawn. */
    reloadTiles() {
        this.redrawAll();
        this.dirty = true;
    }

    private redrawAll() {
        this.decorTodo.clear();
        this.decorSquares.clear();
        this.decorSquarePromises.clear();
        this.tileCache = new TileCache(this.cacheKey);
        for (const tile of this.tiles.values()) this.closeTile(tile);
        this.tiles.clear();
        this.done.clear();
        this.overview.fine.clear();
        this.overview.coarse.clear();
        this.scanQueue.load([]);
        void this.indexRegions();
    }

    /** While on, a click sets one end of a ruler (a third click starts over); dragging still pans. */
    setMeasure(on: boolean) {
        this.measuring = on;
        this.canvas.style.cursor = on ? 'crosshair' : '';
        if (!on) this.ruler = [];
        this.emit('measure', null);
        this.dirty = true;
    }

    /** The map as it is on screen, as a PNG. */
    toBlob(): Promise<Blob> {
        this.draw();
        return new Promise((resolve, reject) =>
            this.canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('The browser could not make an image of the map'))),
                'image/png'
            )
        );
    }

    private addRulerPoint(px: number, py: number) {
        const { x, z } = this.toBlock(px, py);
        if (this.ruler.length >= 2) this.ruler = [];
        this.ruler.push({ x: Math.round(x), z: Math.round(z) });
        const [a, b] = this.ruler;
        this.emit(
            'measure',
            b ? { dx: b.x - a!.x, dz: b.z - a!.z, distance: Math.hypot(b.x - a!.x, b.z - a!.z) } : null
        );
        this.dirty = true;
    }

    /** Zooms around the middle of the view; above 1 closer, below 1 farther. */
    zoomBy(factor: number) {
        this.zoomAt(this.canvas.width / this.dpr / 2, this.canvas.height / this.dpr / 2, factor);
    }

    /** Centres on a block position, optionally at a zoom (pixels per block). */
    goTo(x: number, z: number, scale = this.view.scale) {
        this.smoothCam = null;
        this.flight = null;
        this.view = { x, z, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) };
        this.changed();
    }

    /**
     * Flies to a block position: the view zooms out, crosses the distance and zooms in again (Leaflet's `flyTo`), so a far place is
     * reached in about a second and the terrain on the way is not drawn at full detail. A short hop is a plain glide.
     * Any touch of the map stops it where it is.
     */
    flyTo(x: number, z: number, scale = this.view.scale, duration?: number) {
        const to = { x, z, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) };
        const width = this.canvas.width / this.dpr;
        const path = planFlight({ from: { ...this.view }, to, width });
        // close by, a flight would only zoom out and in again: gliding is enough
        if (!path || Math.hypot(x - this.view.x, z - this.view.z) * this.view.scale < width * 0.6)
            return this.smoothGoTo(x, z, to.scale);
        this.smoothCam = null;
        // a long way would take seconds; a place is reached in 2.5 seconds at most
        this.flight = {
            path: { ...path, duration: duration ?? Math.min(path.duration, 2.5) },
            startTime: performance.now(),
            to
        };
        this.dirty = true;
    }

    /** Smoothly animates camera to target coordinates and scale with cubic easing */
    smoothGoTo(targetX: number, targetZ: number, targetScale = this.view.scale, duration = 380) {
        this.smoothCam = {
            startX: this.view.x,
            startZ: this.view.z,
            startScale: this.view.scale,
            targetX,
            targetZ,
            targetScale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale)),
            startTime: performance.now(),
            duration
        };
        this.dirty = true;
    }

    /** Blooms a cluster node into liquid droplets separating radially or along a spiral */
    spiderfyCluster(cluster: MarkerClusterNode) {
        if (
            this.spiderfy &&
            !this.spiderfy.collapsing &&
            Math.hypot(cluster.x - this.spiderfy.worldX, cluster.z - this.spiderfy.worldZ) < 4
        ) {
            return;
        }

        const n = cluster.markers.length;
        const droplets: SpiderfyDroplet[] = [];

        if (n <= 8) {
            // Radial circle: droplets bloom outwards along evenly spaced spokes
            const radius = Math.max(52, 40 + n * 5);
            for (let i = 0; i < n; i++) {
                const angle = (2 * Math.PI * i) / n - Math.PI / 2;
                const targetOffsetX = Math.cos(angle) * radius;
                const targetOffsetY = Math.sin(angle) * radius;
                droplets.push({
                    marker: cluster.markers[i]!,
                    targetOffsetX,
                    targetOffsetY,
                    currentOffsetX: 0,
                    currentOffsetY: 0,
                    angle,
                    distance: radius
                });
            }
        } else {
            // Archimedean / golden spiral blossom: droplets spiral outward gracefully
            const angleStep = 0.65;
            const initialRadius = 42;
            const radiusStep = 5.2;
            for (let i = 0; i < n; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const dist = initialRadius + i * radiusStep;
                const targetOffsetX = Math.cos(angle) * dist;
                const targetOffsetY = Math.sin(angle) * dist;
                droplets.push({
                    marker: cluster.markers[i]!,
                    targetOffsetX,
                    targetOffsetY,
                    currentOffsetX: 0,
                    currentOffsetY: 0,
                    angle,
                    distance: dist
                });
            }
        }

        const accentColor = getClusterAccentColor(cluster.markers);

        this.spiderfy = {
            cluster,
            worldX: cluster.x,
            worldZ: cluster.z,
            droplets,
            startTime: performance.now(),
            duration: 380,
            collapsing: false,
            collapseStartTime: 0,
            collapseDuration: 180,
            accentColor
        };
        this.dirty = true;
    }

    /** Collapses active spiderfied droplets smoothly back into cluster origin */
    collapseSpiderfy() {
        if (!this.spiderfy || this.spiderfy.collapsing) return;
        this.spiderfy.collapsing = true;
        this.spiderfy.collapseStartTime = performance.now();
        this.dirty = true;
    }

    /** Frames every region the save has. */
    fit() {
        if (this.explored.length) return this.fitBounds(this.explored);
        const r = this.world.regions;
        if (!r.length) return this.goTo(this.world.config.spawn?.x ?? 0, this.world.config.spawn?.z ?? 0, 1);
        const span = REGION_SIZE * 32;
        const x0 = Math.min(...r.map((p) => p.rx)) * span,
            x1 = (Math.max(...r.map((p) => p.rx)) + 1) * span;
        const z0 = Math.min(...r.map((p) => p.rz)) * span,
            z1 = (Math.max(...r.map((p) => p.rz)) + 1) * span;
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        this.goTo((x0 + x1) / 2, (z0 + z1) / 2, Math.min(w / (x1 - x0), h / (z1 - z0)) * 0.9);
    }

    /** Frames the explored chunks, once they are known and until the user moves the view. */
    private fitBounds(chunks: { cx: number; cz: number }[]) {
        let x0 = Infinity,
            x1 = -Infinity,
            z0 = Infinity,
            z1 = -Infinity;
        for (const { cx, cz } of chunks) {
            if (cx < x0) x0 = cx;
            if (cx > x1) x1 = cx;
            if (cz < z0) z0 = cz;
            if (cz > z1) z1 = cz;
        }
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        const bw = (x1 - x0 + 1) * 32,
            bh = (z1 - z0 + 1) * 32;
        this.goTo(((x0 + x1 + 1) * 32) / 2, ((z0 + z1 + 1) * 32) / 2, Math.min(w / bw, h / bh) * 0.9);
    }

    destroy() {
        this.poiGenerator.dispose();
        this.dead = true;
        this.spiderfy = null;
        this.smoothCam = null;
        window.clearTimeout(this.saveTimer);
        void this.flushOverview();
        void this.tileCache.flushAll();
        if (this.ownPool) this.pool.destroy();
        if (this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = 0;
            this.frameRequested = false;
        }
        this.off.forEach((f) => f());
        for (const tile of this.tiles.values()) this.closeTile(tile);
        this.tiles.clear();
        for (const c of this.predicted.values()) this.closeTile(c);
        this.predicted.clear();
        for (const c of this.spawnLayer.values()) this.closeTile(c);
        this.spawnLayer.clear();
    }

    toBlock(px: number, py: number) {
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        return { x: this.view.x + (px - w / 2) / this.view.scale, z: this.view.z + (py - h / 2) / this.view.scale };
    }
    toScreen(x: number, z: number) {
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        return { x: (x - this.view.x) * this.view.scale + w / 2, y: (z - this.view.z) * this.view.scale + h / 2 };
    }

    findTargetAt(
        px: number,
        py: number
    ): { cluster?: MarkerClusterNode; marker?: MapMarker; isSpiderfyOrigin?: boolean } | null {
        if (!this.options.markers) return null;

        // Check active spiderfy droplets first
        if (this.spiderfy && !this.spiderfy.collapsing) {
            const origin = this.toScreen(this.spiderfy.worldX, this.spiderfy.worldZ);
            for (let i = this.spiderfy.droplets.length - 1; i >= 0; i--) {
                const d = this.spiderfy.droplets[i]!;
                const dx = origin.x + d.currentOffsetX - px;
                const dy = origin.y + d.currentOffsetY - py;
                if (dx * dx + dy * dy <= 18 * 18) {
                    return { marker: d.marker };
                }
            }
            const ox = origin.x - px;
            const oy = origin.y - py;
            if (ox * ox + oy * oy <= 14 * 14) {
                return { cluster: this.spiderfy.cluster, isSpiderfyOrigin: true };
            }
        }

        const visible = this.getVisibleMarkers();
        const clusters = this.getClusters(visible);
        for (let i = clusters.length - 1; i >= 0; i--) {
            const c = clusters[i]!;
            if (this.spiderfy && !this.spiderfy.collapsing) {
                const wdx = c.x - this.spiderfy.worldX;
                const wdz = c.z - this.spiderfy.worldZ;
                if (wdx * wdx + wdz * wdz < 25) {
                    continue;
                }
            }
            const count = c.markers.length;
            const dx = c.screenX - px;
            const dy = c.screenY - py;
            const d2 = dx * dx + dy * dy;
            if (count > 1) {
                const r = count >= 100 ? 24 : count >= 10 ? 20 : 18;
                if (d2 <= r * r) {
                    return { cluster: c };
                }
            } else {
                const m = c.markers[0]!;
                if (d2 <= 20 * 20) {
                    return { marker: m };
                }
            }
        }
        return null;
    }

    findMarkerAt(px: number, py: number): MapMarker | null {
        const target = this.findTargetAt(px, py);
        if (!target) return null;
        return target.marker ?? (target.cluster ? target.cluster.markers[0]! : null);
    }

    private expandCluster(cluster: MarkerClusterNode) {
        const minX = Math.min(...cluster.markers.map((m) => m.x));
        const maxX = Math.max(...cluster.markers.map((m) => m.x));
        const minZ = Math.min(...cluster.markers.map((m) => m.z));
        const maxZ = Math.max(...cluster.markers.map((m) => m.z));
        const span = Math.hypot(maxX - minX, maxZ - minZ);

        if (span > 8) {
            // Target scale where span in pixels is at least 110px
            const idealScale = 110 / Math.max(span, 10);
            const nextScale = Math.min(MAX_SCALE, Math.max(this.view.scale * 2.4, idealScale));
            this.smoothGoTo(cluster.x, cluster.z, nextScale, 400);
        } else {
            // Stacked at the exact same coordinate - blossom droplets
            this.spiderfyCluster(cluster);
        }
    }

    private changed() {
        const now = performance.now();
        const dt = (now - this.lastMove.at) / 1000;
        if (this.lastMove.at && dt > 0.005 && dt < 0.5) {
            const k = 0.4;
            this.velocity.x = this.velocity.x * (1 - k) + ((this.view.x - this.lastMove.x) / dt) * k;
            this.velocity.z = this.velocity.z * (1 - k) + ((this.view.z - this.lastMove.z) / dt) * k;
            this.velocity.at = now;
        }
        this.lastMove = { x: this.view.x, z: this.view.z, at: now };
        this.dirty = true;
        this.emit('view', { ...this.view });
        const visible = this.getVisibleMarkers();
        if (visible !== this.lastEmittedMarkers) {
            this.lastEmittedMarkers = visible;
            this.emit('markers', visible);
        }
    }

    // ---- input ----------------------------------------------------------------

    private bind() {
        const c = this.canvas;
        const on = (t: HTMLElement | Window, type: string, fn: (e: any) => void, opt?: AddEventListenerOptions) => {
            t.addEventListener(type, fn, opt);
            this.off.push(() => t.removeEventListener(type, fn, opt));
        };
        c.style.touchAction = 'none';
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                this.setActive(false);
                void this.flushOverview();
                void this.tileCache.flushAll();
            } else {
                this.setActive(true);
            }
        };
        on(document as unknown as HTMLElement, 'visibilitychange', onVisibility);
        on(window, 'pagehide', () => {
            this.setActive(false);
            void this.flushOverview();
            void this.tileCache.flushAll();
        });
        on(c, 'pointerdown', (e: PointerEvent) => {
            this.smoothCam = null;
            this.flight = null;
            this.mousePos = null;
            this.currentHit = null;
            c.setPointerCapture(e.pointerId);
            this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
            this.pinch = this.pointerDistance();
            this.downAt = this.pointers.size === 1 ? { x: e.offsetX, y: e.offsetY } : null;
        });
        on(c, 'pointermove', (e: PointerEvent) => {
            const prev = this.pointers.get(e.pointerId);
            if (prev) {
                this.mousePos = null;
                this.currentHit = null;
                this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
                if (this.pointers.size === 1) {
                    this.view.x -= (e.offsetX - prev.x) / this.view.scale;
                    this.view.z -= (e.offsetY - prev.y) / this.view.scale;
                    this.changed();
                } else if (this.pointers.size === 2) {
                    const d = this.pointerDistance();
                    if (this.pinch > 0 && d > 0) this.zoomAt(this.centre().x, this.centre().y, d / this.pinch);
                    this.pinch = d;
                }
            } else {
                const prevHit = this.currentHit;
                this.mousePos = { x: e.offsetX, y: e.offsetY };
                const newHit = this.findTargetAt(e.offsetX, e.offsetY);
                this.currentHit = newHit;
                c.style.cursor = newHit ? 'pointer' : this.measuring ? 'crosshair' : 'grab';
                const hitChanged =
                    (prevHit !== null) !== (newHit !== null) ||
                    prevHit?.marker?.id !== newHit?.marker?.id ||
                    prevHit?.cluster?.x !== newHit?.cluster?.x ||
                    prevHit?.cluster?.z !== newHit?.cluster?.z;
                if (hitChanged) {
                    this.dirty = true;
                }
            }
            this.emit('hover', this.hoverAt(e.offsetX, e.offsetY));
        });
        const up = (e: PointerEvent) => {
            this.pointers.delete(e.pointerId);
            this.pinch = this.pointerDistance();
        };
        on(c, 'pointerup', (e: PointerEvent) => {
            const d = this.downAt;
            this.downAt = null;
            if (d && Math.hypot(e.offsetX - d.x, e.offsetY - d.y) < 6) {
                if (this.measuring) {
                    this.addRulerPoint(e.offsetX, e.offsetY);
                } else {
                    const target = this.findTargetAt(e.offsetX, e.offsetY);
                    if (target) {
                        if (target.isSpiderfyOrigin) {
                            this.collapseSpiderfy();
                        } else if (target.cluster && target.cluster.markers.length > 1) {
                            if (target.cluster.markers.length <= 16) {
                                this.spiderfyCluster(target.cluster);
                            } else {
                                this.expandCluster(target.cluster);
                            }
                        } else if (target.marker) {
                            this.emit('markerClick', target.marker);
                        }
                    } else {
                        // Clicked outside on ground - collapse active spiderfied droplets
                        if (this.spiderfy) {
                            this.collapseSpiderfy();
                        }
                    }
                }
            }
            up(e);
        });
        on(c, 'pointercancel', up);
        on(c, 'pointerleave', () => {
            if (this.mousePos || this.currentHit) {
                this.mousePos = null;
                this.currentHit = null;
                this.dirty = true;
            }
            this.emit('hover', null);
        });
        on(
            c,
            'wheel',
            (e: WheelEvent) => {
                e.preventDefault();
                if (this.spiderfy) this.collapseSpiderfy();
                this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
            },
            { passive: false }
        );
        on(c, 'dblclick', (e: MouseEvent) => {
            if (this.spiderfy) this.collapseSpiderfy();
            this.zoomAt(e.offsetX, e.offsetY, 2);
        });
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => this.resize());
            ro.observe(c);
            this.off.push(() => ro.disconnect());
        }
    }

    private pointerDistance() {
        const p = [...this.pointers.values()];
        return p.length === 2 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0;
    }
    private centre() {
        const p = [...this.pointers.values()];
        return { x: (p[0]!.x + p[1]!.x) / 2, y: (p[0]!.y + p[1]!.y) / 2 };
    }

    /** Zooms keeping the block under (px, py) where it is. */
    private zoomAt(px: number, py: number, factor: number) {
        this.flight = null;
        const before = this.toBlock(px, py);
        this.view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.view.scale * factor));
        const after = this.toBlock(px, py);
        this.view.x += before.x - after.x;
        this.view.z += before.z - after.z;
        this.changed();
    }

    private hoverAt(px: number, py: number): HoverInfo {
        const { x, z } = this.toBlock(px, py);
        const bx = Math.floor(x),
            bz = Math.floor(z);
        const chunkX = floorDiv(bx, 32),
            chunkZ = floorDiv(bz, 32);
        return {
            x: bx,
            z: bz,
            chunkX,
            chunkZ,
            regionX: floorDiv(chunkX, REGION_SIZE),
            regionZ: floorDiv(chunkZ, REGION_SIZE),
            explored: this.existing.has(chunkKey(chunkX, chunkZ))
        };
    }

    resize() {
        this.dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
        const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.dirty = true;
        }
    }

    // ---- loading --------------------------------------------------------------

    // ---- the generator's far-out picture ---------------------------------------

    /** One 32 × 32 canvas per region, one pixel per chunk, from the generator rather than from the save. */
    private predicted = new Map<string, HTMLCanvasElement | ImageBitmap>();
    private predictedAsked = new Set<string>();
    private predictedOn = false;
    private predictedInflight = 0;

    /** Whether the pool can predict (the person's game files have been given to it): draws the world around what the save has. */
    setPredicted(on: boolean) {
        this.predictedOn = on;
        for (const c of this.predicted.values()) this.closeTile(c);
        this.predicted.clear();
        this.predictedAsked.clear();
        this.dirty = true;
    }

    private schedulePredicted() {
        if (!this.predictedOn || this.dead || !this.active) return;
        const v = this.visibleChunks();
        const rx0 = floorDiv(v.c0, REGION_SIZE),
            rx1 = floorDiv(v.c1, REGION_SIZE),
            rz0 = floorDiv(v.r0, REGION_SIZE),
            rz1 = floorDiv(v.r1, REGION_SIZE);
        if ((rx1 - rx0 + 1) * (rz1 - rz0 + 1) > 1200) return; // too far out to be worth it
        const want: { rx: number; rz: number; d: number }[] = [];
        const cx = (v.c0 + v.c1) / 2 / REGION_SIZE,
            cz = (v.r0 + v.r1) / 2 / REGION_SIZE;
        // one region beyond the view too, asked after the ones in it, so panning shows something at once
        for (let rz = rz0 - 1; rz <= rz1 + 1; rz++) {
            for (let rx = rx0 - 1; rx <= rx1 + 1; rx++) {
                if (!this.predictedAsked.has(`${rx}.${rz}`))
                    want.push({ rx, rz, d: (rx + 0.5 - cx) ** 2 + (rz + 0.5 - cz) ** 2 });
            }
        }
        want.sort((a, b) => a.d - b.d);
        for (const { rx, rz } of want) {
            if (this.predictedInflight >= Math.max(1, this.pool.size)) break;
            const key = `${rx}.${rz}`;
            this.predictedAsked.add(key);
            this.predictedInflight++;
            const saved = this.cacheKey;
            // a region worked out before comes from the browser's cache; otherwise a worker makes it, and it is kept for next time
            (saved ? loadPredicted(saved, rx, rz) : Promise.resolve(null))
                .then(
                    (hit) =>
                        hit ??
                        this.pool
                            .run<Uint8ClampedArray | null>('predictRegion', { rx, rz }, 0.5)
                            .promise.then((made) => {
                                if (made && saved) void savePredicted(saved, rx, rz, made);
                                return made;
                            })
                )
                .then((pixels) => {
                    if (this.dead || !this.predictedOn || !pixels) return;
                    this.createRegionCanvas(pixels).then((c) => {
                        if (this.dead || !this.predictedOn) {
                            this.closeTile(c);
                            return;
                        }
                        this.closeTile(this.predicted.get(key));
                        this.predicted.set(key, c);
                        this.dirty = true;
                    });
                })
                .catch((e) => {
                    if (!this.dead) console.warn(`[hychunk] predicted region ${key} failed`, e);
                })
                .finally(() => {
                    this.predictedInflight--;
                    this.dirty = true; // the next regions are asked on the next frame
                });
        }
    }

    // ---- where a mob spawns ------------------------------------------------------

    private spawnArea: { envs?: string[]; biomes?: string[] } | null = null;
    private spawnLayer = new Map<string, HTMLCanvasElement | ImageBitmap>();
    private spawnAsked = new Set<string>();
    private spawnInflight = 0;

    /** Paints the chunks whose environment is one of `envs` (a mob's spawn area, orange) or whose biome is one of `biomes` (pink) over the map; `null` clears it. */
    setHighlight(area: { envs?: string[]; biomes?: string[] } | null) {
        this.spawnArea = area && (area.envs?.length || area.biomes?.length) ? area : null;
        for (const c of this.spawnLayer.values()) this.closeTile(c);
        this.spawnLayer.clear();
        this.spawnAsked.clear();
        this.dirty = true;
    }

    private scheduleSpawnArea() {
        const area = this.spawnArea;
        if (!area || !this.predictedOn || this.dead || !this.active) return;
        const v = this.visibleChunks();
        const rx0 = floorDiv(v.c0, REGION_SIZE),
            rx1 = floorDiv(v.c1, REGION_SIZE),
            rz0 = floorDiv(v.r0, REGION_SIZE),
            rz1 = floorDiv(v.r1, REGION_SIZE);
        if ((rx1 - rx0 + 1) * (rz1 - rz0 + 1) > 1200) return;
        const want: { rx: number; rz: number; d: number }[] = [];
        const cx = (v.c0 + v.c1) / 2 / REGION_SIZE,
            cz = (v.r0 + v.r1) / 2 / REGION_SIZE;
        for (let rz = rz0; rz <= rz1; rz++)
            for (let rx = rx0; rx <= rx1; rx++)
                if (!this.spawnAsked.has(`${rx}.${rz}`))
                    want.push({ rx, rz, d: (rx + 0.5 - cx) ** 2 + (rz + 0.5 - cz) ** 2 });
        want.sort((a, b) => a.d - b.d);
        for (const { rx, rz } of want) {
            if (this.spawnInflight >= Math.max(1, this.pool.size)) break;
            const key = `${rx}.${rz}`;
            this.spawnAsked.add(key);
            this.spawnInflight++;
            this.pool
                .run<Uint8ClampedArray | null>('highlightRegion', { rx, rz, ...area }, 0.5)
                .promise.then((pixels) => {
                    if (this.dead || this.spawnArea !== area || !pixels) return;
                    this.createRegionCanvas(pixels).then((c) => {
                        if (this.dead || this.spawnArea !== area) {
                            this.closeTile(c);
                            return;
                        }
                        this.closeTile(this.spawnLayer.get(key));
                        this.spawnLayer.set(key, c);
                        this.dirty = true;
                    });
                })
                .catch((e) => {
                    if (!this.dead) console.warn(`[hychunk] spawn area ${key} failed`, e);
                })
                .finally(() => {
                    this.spawnInflight--;
                    this.dirty = true;
                });
        }
    }

    /** The area a mob spawns in, as environments. */
    setSpawnArea(envs: string[] | null) {
        this.setHighlight(envs ? { envs } : null);
    }

    private visibleChunks() {
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        const a = this.toBlock(0, 0),
            b = this.toBlock(w, h);
        return { c0: floorDiv(a.x, 32), r0: floorDiv(a.z, 32), c1: floorDiv(b.x, 32), r1: floorDiv(b.z, 32) };
    }

    /**
     * The chunks worth having ready: the screen, a margin around it, and more on the
     * side the view is moving towards. Falls back to the screen alone when that is too much to hold.
     */
    private prefetchRect() {
        const v = this.visibleChunks();
        const w = v.c1 - v.c0 + 1,
            h = v.r1 - v.r0 + 1;
        const age = (performance.now() - this.velocity.at) / 1000;
        const fade = age < 0.35 ? 1 : 0; // a pause ends the prediction
        const ahead = (speed: number, size: number) =>
            Math.min(size, Math.max(0, Math.ceil((Math.abs(speed) * fade * 1.5) / 32)));
        // moving, the margin follows the movement; at rest it still reaches half a screen, so what is next to the view is ready when it is asked for
        const mx = fade ? Math.max(2, Math.ceil(w * 0.35)) : Math.max(2, Math.ceil(w * 0.5));
        const mz = fade ? Math.max(2, Math.ceil(h * 0.35)) : Math.max(2, Math.ceil(h * 0.5));
        const ex = ahead(this.velocity.x, w),
            ez = ahead(this.velocity.z, h);
        const r = {
            c0: v.c0 - mx - (this.velocity.x < 0 ? ex : 0),
            c1: v.c1 + mx + (this.velocity.x > 0 ? ex : 0),
            r0: v.r0 - mz - (this.velocity.z < 0 ? ez : 0),
            r1: v.r1 + mz + (this.velocity.z > 0 ? ez : 0)
        };
        return (r.c1 - r.c0 + 1) * (r.r1 - r.r0 + 1) > MAX_DETAIL_VISIBLE ? v : r;
    }

    /** Too far out (or too much on screen) for single chunks: only the regions' overview is drawn. */
    private overviewOnly(v: { c0: number; r0: number; c1: number; r1: number }) {
        return 32 * this.view.scale < DETAIL_MIN_PX || (v.c1 - v.c0 + 1) * (v.r1 - v.r0 + 1) > MAX_DETAIL_VISIBLE;
    }

    private schedule() {
        this.schedulePredicted();
        this.scheduleSpawnArea();
        const view = this.visibleChunks();
        if (this.overviewOnly(view)) {
            this.queue = [];
            this.queued.clear();
            this.rectKey = '';
            this.pump();
            return;
        }
        const { c0, r0, c1, r1 } = this.prefetchRect();
        this.warmDecorSquares({ c0, r0, c1, r1 });
        const sig = `${c0},${r0},${c1},${r1},${view.c0},${view.r0}`;
        if (sig === this.rectKey && this.queue.length) return;
        this.rectKey = sig;

        const cx = (view.c0 + view.c1) / 2,
            cz = (view.r0 + view.r1) / 2;
        const vx = this.velocity.x,
            vz = this.velocity.z;
        const moving = performance.now() - this.velocity.at < 350 && Math.hypot(vx, vz) > 20;
        const want: { cx: number; cz: number; rank: number }[] = [];
        for (let z = r0; z <= r1; z++) {
            for (let x = c0; x <= c1; x++) {
                if (this.tiles.has(chunkKey(x, z))) continue;
                const inside = x >= view.c0 && x <= view.c1 && z >= view.r0 && z <= view.r1;
                let d = (x - cx) ** 2 + (z - cz) ** 2;
                // Outside the screen, what lies in the direction of travel goes first.
                if (!inside && moving) d -= (((x - cx) * vx + (z - cz) * vz) / Math.hypot(vx, vz)) * 4;
                want.push({ cx: x, cz: z, rank: (inside ? 0 : 1e9) + d });
            }
        }
        want.sort((p, q) => p.rank - q.rank);
        this.queue = want;
        this.queued = new Set(want.map((p) => chunkKey(p.cx, p.cz)));
        this.pump();
    }

    /** Chunks on screen not drawn yet: what the person is waiting for (the prefetch around the screen does not count). */
    private missingVisible() {
        const v = this.visibleChunks();
        let n = 0;
        for (let z = v.r0; z <= v.r1; z++) for (let x = v.c0; x <= v.c1; x++) if (!this.tiles.has(chunkKey(x, z))) n++;
        return n;
    }

    /** The share of the chunks on screen that are drawn, 0 to 1 (what is prefetched around the screen does not count). */
    progress() {
        const v = this.visibleChunks();
        if (this.overviewOnly(v)) {
            // zoomed far out no chunk is drawn: what is waited for are the regions of the far-out picture
            if (!this.predictedOn) return 1;
            let regions = 0,
                ready = 0;
            for (let rz = floorDiv(v.r0, REGION_SIZE); rz <= floorDiv(v.r1, REGION_SIZE); rz++)
                for (let rx = floorDiv(v.c0, REGION_SIZE); rx <= floorDiv(v.c1, REGION_SIZE); rx++) {
                    regions++;
                    if (this.predicted.has(`${rx}.${rz}`)) ready++;
                }
            return regions ? ready / regions : 1;
        }
        let total = 0,
            done = 0;
        for (let z = v.r0; z <= v.r1; z++) {
            for (let x = v.c0; x <= v.c1; x++) {
                total++;
                if (this.tiles.has(chunkKey(x, z))) done++;
            }
        }
        return total ? done / total : 0;
    }

    /** The first screen is complete (a few chunks may still be on their way). */
    isSettled() {
        return this.progress() >= 0.97;
    }

    /** Numbers for tuning and tests. */
    stats() {
        const v = this.visibleChunks();
        let visibleMissing = 0,
            outside = 0;
        for (let z = v.r0; z <= v.r1; z++) {
            for (let x = v.c0; x <= v.c1; x++) {
                const k = chunkKey(x, z);
                if (this.existing.has(k) && !this.tiles.get(k)) visibleMissing++;
            }
        }
        for (const [k, t] of this.tiles) {
            if (!t) continue;
            const [x, z] = k.split(',').map(Number) as [number, number];
            if (x < v.c0 || x > v.c1 || z < v.r0 || z > v.r1) outside++;
        }
        return {
            predicted: this.predicted.size,
            tiles: this.tiles.size,
            queued: this.queue.length,
            scanQueued: this.scanQueue.size,
            visibleMissing,
            prefetched: outside,
            cacheHits: this.tileCache.hits,
            cacheMisses: this.tileCache.misses
        };
    }

    /** Keeps the pool busy with the most wanted chunks: what is on screen and around it, then the overview. */
    private pump() {
        const limit = this.pool.size * 2;
        while (!this.dead && this.active && this.inflight < limit) {
            const detail = this.queue.length > 0;
            const next = detail ? this.queue.shift() : this.scanQueue.next(this.currentView());
            if (!next) break;
            const key = chunkKey(next.cx, next.cz);
            const stride = (next as { stride?: number }).stride ?? 1;
            this.queued.delete(key);
            if (detail ? this.tiles.has(key) : this.done.has(key)) continue;
            this.inflight++;
            // A chunk seen before comes from the cache; only new ones are read and decoded.
            this.fetchTile(next.cx, next.cz, detail)
                .then((res) => this.accept(next.cx, next.cz, detail, stride, res))
                .catch((e) => {
                    if (!this.dead) console.warn(`[hychunk] chunk ${key} failed`, e);
                    if (detail) this.tiles.set(key, null);
                })
                .finally(() => {
                    this.inflight--;
                    this.done.add(key);
                    this.loaded++;
                    if (detail || this.loaded % 16 === 0 || this.inflight === 0) {
                        this.dirty = true;
                    }
                    const idle = this.inflight === 0 && !this.queue.length && !this.scanQueue.size;
                    if (this.loaded % 32 === 0 || idle) {
                        this.emit('loading', {
                            pending: this.missingVisible(),
                            loaded: this.loaded,
                            damaged: this.damaged.size
                        });
                    }
                    if (idle) void this.flushOverview(); // the whole world has been read: keep it
                    this.pump();
                    this.pumpDecor();
                });
        }
    }

    private currentView() {
        const v = this.visibleChunks();
        return { cx: (v.c0 + v.c1) / 2, cz: (v.r0 + v.r1) / 2, ...v };
    }

    private async fetchTile(cx: number, cz: number, detail: boolean): Promise<TileResult> {
        // a cache that is slow to answer must not hold the drawing back: after a moment the chunk is made anew
        const hit = await Promise.race([
            this.tileCache.get(cx, cz),
            new Promise<null>((r) => setTimeout(() => r(null), CACHE_WAIT_MS))
        ]);
        if (hit) return hit; // a cached predicted chunk may or may not have its decor: `decor` says
        // A chunk the save lacks is drawn once, with its trees, rocks and plants: those are worked out a square at a time, shared by
        // every tile, and only take a moment, so the tile waits for them instead of being drawn twice.
        const predicted = detail && this.predictedOn && !this.existing.has(chunkKey(cx, cz));
        // ...unless they are slow to come (the workers are still starting): then the tile is drawn at once without them and gets them in a second pass
        const sites = predicted
            ? await Promise.race([
                  this.decorSitesFor(cx, cz),
                  new Promise<null>((r) => setTimeout(() => r(null), DECOR_WAIT_MS))
              ])
            : undefined;
        const res = await this.pool.run<TileResult>(
            'tile',
            sites ? { cx, cz, decor: true, sites } : { cx, cz },
            detail ? 0 : 1
        ).promise;
        void this.tileCache.put(cx, cz, res.pixels, res.corrupt, Boolean(res.decor));
        return res;
    }

    private accept(cx: number, cz: number, detail: boolean, stride: number, res: TileResult) {
        const key = chunkKey(cx, cz);
        if (res.corrupt) this.damaged.add(key);
        if (!res.pixels) {
            if (detail) this.tiles.set(key, null);
            return;
        }
        const rx = floorDiv(cx, REGION_SIZE),
            rz = floorDiv(cz, REGION_SIZE);
        const lx = cx - rx * REGION_SIZE,
            lz = cz - rz * REGION_SIZE;
        const rgb = averageColor(res.pixels);
        if (rgb) {
            this.overview.paintFine(rx, rz, lx, lz, rgb);
            if (stride > 1) {
                this.overview.paintCoarse(rx, rz, lx, lz, stride, rgb, (x, z) =>
                    this.existing.has(chunkKey(rx * REGION_SIZE + x, rz * REGION_SIZE + z))
                );
            }
            this.touchOverview();
        }
        if (!detail) return;
        this.createTile(res.pixels).then((tile) => {
            if (this.dead) {
                this.closeTile(tile);
                return;
            }
            this.closeTile(this.tiles.get(key));
            this.tiles.set(key, tile);
            this.dirty = true;
        });
        // a chunk the save lacks is drawn at once without its trees, rocks and plants, and gets them in a second pass
        if (this.predictedOn && !res.decor && !this.existing.has(key)) this.decorTodo.add(key);
        this.pumpDecor();
    }

    // ---- trees, rocks and plants: the second pass over predicted chunks ---------------------------

    private decorTodo = new Set<string>();
    private decorInflight = 0;
    /** The trees, rocks and plants of each 512-block square, worked out once by whichever worker is free and handed to every tile that needs them. */
    private decorSquares = new Map<string, DecorSite[]>();
    private decorSquarePromises = new Map<string, Promise<DecorSite[]>>();
    private decorSquareInflight = 0;

    /** The squares a chunk reads: its own area and a margin for the neighbours' edges (trees reach 64 blocks). */
    private decorSquaresFor(cx: number, cz: number): { qx: number; qz: number }[] {
        const out: { qx: number; qz: number }[] = [];
        for (let qz = Math.floor((cz * 32 - 100) / 512); qz <= Math.floor((cz * 32 + 131) / 512); qz++) {
            for (let qx = Math.floor((cx * 32 - 100) / 512); qx <= Math.floor((cx * 32 + 131) / 512); qx++)
                out.push({ qx, qz });
        }
        return out;
    }

    private decorSquare(qx: number, qz: number, priority: number): Promise<DecorSite[]> {
        const key = `${qx},${qz}`;
        let p = this.decorSquarePromises.get(key);
        if (!p) {
            this.decorSquareInflight++;
            p = this.pool
                .run<DecorSite[] | null>('decorSquare', { qx, qz }, priority)
                .promise.then((sites) => {
                    const list = sites ?? [];
                    this.decorSquares.set(key, list);
                    return list;
                })
                .catch((e) => {
                    if (!this.dead) console.warn(`[hychunk] decor square ${key} failed`, e);
                    this.decorSquares.set(key, []);
                    return [] as DecorSite[];
                })
                .finally(() => {
                    this.decorSquareInflight--;
                });
            this.decorSquarePromises.set(key, p);
        }
        return p;
    }

    /** The sites that can reach a chunk or its neighbours' edges, once their squares are in. */
    private async decorSitesFor(cx: number, cz: number): Promise<DecorSite[]> {
        const need = this.decorSquaresFor(cx, cz);
        const lists = await Promise.all(need.map(({ qx, qz }) => this.decorSquare(qx, qz, 0.8)));
        const x0 = cx * 32 - 40,
            x1 = cx * 32 + 71,
            z0 = cz * 32 - 40,
            z1 = cz * 32 + 71;
        const sites: DecorSite[] = [];
        for (const list of lists) {
            for (const s of list) {
                const f = s.footprint;
                if (s.x + f[1] >= x0 && s.x + f[0] <= x1 && s.z + f[3] >= z0 && s.z + f[2] <= z1) sites.push(s);
            }
        }
        return sites;
    }

    /** Gets the squares around what is prefetched ready ahead of the tiles, one square beyond, without crowding out the tiles. */
    private warmDecorSquares(rect: { c0: number; r0: number; c1: number; r1: number }) {
        if (!this.predictedOn) return;
        const q0x = Math.floor((rect.c0 * 32 - 160) / 512),
            q1x = Math.floor((rect.c1 * 32 + 192) / 512);
        const q0z = Math.floor((rect.r0 * 32 - 160) / 512),
            q1z = Math.floor((rect.r1 * 32 + 192) / 512);
        if ((q1x - q0x + 1) * (q1z - q0z + 1) > 80) return;
        const mx = (q0x + q1x) / 2,
            mz = (q0z + q1z) / 2;
        const want: { qx: number; qz: number; d: number }[] = [];
        for (let qz = q0z; qz <= q1z; qz++)
            for (let qx = q0x; qx <= q1x; qx++)
                if (!this.decorSquarePromises.has(`${qx},${qz}`))
                    want.push({ qx, qz, d: (qx - mx) ** 2 + (qz - mz) ** 2 });
        want.sort((a, b) => a.d - b.d);
        for (const { qx, qz } of want) {
            if (this.decorSquareInflight >= Math.max(2, this.pool.size)) break;
            void this.decorSquare(qx, qz, 1.5);
        }
    }

    /** A cached tile from before the second kind of data existed, or one drawn without its decor: given its decor now. */
    private pumpDecor() {
        if (this.dead || !this.active || !this.predictedOn || !this.decorTodo.size || this.queue.length) return;
        const v = this.visibleChunks();
        const mx = (v.c0 + v.c1) / 2,
            mz = (v.r0 + v.r1) / 2;
        const near = [...this.decorTodo]
            .map((k) => {
                const [cx, cz] = k.split(',').map(Number) as [number, number];
                return { k, cx, cz, d: (cx - mx) ** 2 + (cz - mz) ** 2 };
            })
            .sort((a, b) => a.d - b.d);
        const limit = Math.max(1, this.pool.size - 1);
        for (const { k, cx, cz } of near) {
            if (this.decorInflight >= limit) break;
            this.decorTodo.delete(k);
            if (!this.tiles.get(k)) continue; // gone from memory meanwhile
            this.decorInflight++;
            void this.decorSitesFor(cx, cz)
                .then((sites) => this.pool.run<TileResult>('tile', { cx, cz, decor: true, sites }, 2).promise)
                .then((res) => {
                    if (this.dead || !res.pixels) return;
                    void this.tileCache.put(cx, cz, res.pixels, false, true);
                    if (!this.tiles.get(k)) return;
                    this.createTile(res.pixels).then((tile) => {
                        if (this.dead) {
                            this.closeTile(tile);
                            return;
                        }
                        if (!this.tiles.get(k)) {
                            this.closeTile(tile);
                            return;
                        }
                        this.closeTile(this.tiles.get(k));
                        this.tiles.set(k, tile);
                        this.dirty = true;
                    });
                })
                .catch((e) => {
                    if (!this.dead) console.warn(`[hychunk] decor ${k} failed`, e);
                })
                .finally(() => {
                    this.decorInflight--;
                    this.pumpDecor();
                });
        }
    }

    private get cacheKey() {
        return this.world.cacheKey
            ? `${this.world.cacheKey}|g${this.options.dataVersion ?? ''}|c${COLORS_VERSION}|r${RENDER_VERSION}|t${this.options.terrain ? 1 : 0}|s${this.options.styled ? 1 : 0}`
            : null;
    }

    /** Saves what has been read a moment after reading stops, so reopening the world starts from it. */
    private touchOverview() {
        this.dirtyOverview = true;
        if (!this.cacheKey || this.saveTimer) return;
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = 0;
            void this.flushOverview();
        }, 3000);
    }

    private async flushOverview() {
        const key = this.cacheKey;
        if (!key || !this.dirtyOverview) return;
        this.dirtyOverview = false;
        await saveOverview(key, this.overview.toBuffers());
    }

    /** Lists every chunk the save has (from region headers only), then queues the ones the saved overview does not cover. */
    private async indexRegions() {
        const found: { cx: number; cz: number }[] = [];
        for (const { rx, rz } of this.world.regions) {
            if (this.dead) return;
            try {
                const region = await this.world.openRegion(rx, rz);
                for (const slot of region.slots()) {
                    const c = chunkOf(rx, rz, slot);
                    found.push(c);
                    this.existing.add(chunkKey(c.cx, c.cz));
                }
            } catch (e) {
                console.warn(`[hychunk] region ${rx}.${rz} failed`, e);
            }
        }
        this.explored = found.slice();
        // What an earlier visit already read is drawn straight away and not read again.
        const key = this.cacheKey;
        const saved = key ? await loadOverview(key) : null;
        if (this.dead) return;
        if (saved) for (const k of this.overview.fromBuffers(saved)) if (this.existing.has(k)) this.done.add(k);
        this.scanQueue.load(found.filter((c) => !this.done.has(chunkKey(c.cx, c.cz))));
        this.dirty = true;
        this.emit('loading', { pending: this.scanQueue.size, loaded: this.loaded, damaged: this.damaged.size });
        this.pump();
    }

    private evict() {
        if (this.tiles.size <= MAX_TILES) return;
        const keep = this.prefetchRect();
        const c0 = keep.c0 - 2,
            r0 = keep.r0 - 2,
            c1 = keep.c1 + 2,
            r1 = keep.r1 + 2;
        for (const key of this.tiles.keys()) {
            if (this.tiles.size <= MAX_TILES * 0.75) break;
            const [x, z] = key.split(',').map(Number) as [number, number];
            if (x < c0 || x > c1 || z < r0 || z > r1) {
                this.closeTile(this.tiles.get(key));
                this.tiles.delete(key);
            }
        }
    }

    // ---- drawing --------------------------------------------------------------

    private loop = () => {
        this.frameRequested = false;
        if (this.dead || !this.active) return;
        const now = performance.now();

        if (this.flight) {
            const t = (now - this.flight.startTime) / (this.flight.path.duration * 1000);
            const p = this.flight.path.at(t);
            this.view.x = p.x;
            this.view.z = p.z;
            this.view.scale = p.scale;
            this.changed();
            if (t >= 1) this.flight = null;
            else this.dirty = true;
        }

        // 1. Update smooth camera animation
        if (this.smoothCam) {
            const p = Math.min(1, (now - this.smoothCam.startTime) / this.smoothCam.duration);
            // Cubic ease-out
            const t = 1 - Math.pow(1 - p, 3);
            this.view.x = this.smoothCam.startX + (this.smoothCam.targetX - this.smoothCam.startX) * t;
            this.view.z = this.smoothCam.startZ + (this.smoothCam.targetZ - this.smoothCam.startZ) * t;
            this.view.scale = this.smoothCam.startScale + (this.smoothCam.targetScale - this.smoothCam.startScale) * t;
            this.changed();
            if (p >= 1) {
                this.smoothCam = null;
            } else {
                this.dirty = true;
            }
        }

        // 2. Update spiderfy droplet blossoming animation
        if (this.spiderfy) {
            if (!this.spiderfy.collapsing) {
                const p = Math.min(1, (now - this.spiderfy.startTime) / this.spiderfy.duration);
                // Elastic overshoot spring ease-out for liquid droplet separation
                const ease =
                    p <= 0
                        ? 0
                        : p >= 1
                          ? 1
                          : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
                for (const d of this.spiderfy.droplets) {
                    d.currentOffsetX = d.targetOffsetX * ease;
                    d.currentOffsetY = d.targetOffsetY * ease;
                }
                if (p < 1) {
                    this.dirty = true;
                }
            } else {
                const cp = Math.min(1, (now - this.spiderfy.collapseStartTime) / this.spiderfy.collapseDuration);
                // Ease-in snap retraction
                const ease = Math.max(0, 1 - cp * cp);
                for (const d of this.spiderfy.droplets) {
                    d.currentOffsetX = d.targetOffsetX * ease;
                    d.currentOffsetY = d.targetOffsetY * ease;
                }
                if (cp >= 1) {
                    this.spiderfy = null;
                }
                this.dirty = true;
            }
        }

        if (this.dirty && this.active) {
            this.dirty = false;
            this.schedule();
            this.draw();
            this.evict();
        }
        if (this.flight || this.smoothCam || this.spiderfy || this.dirty) {
            this.requestFrame();
        }
    };

    private draw() {
        const { ctx, canvas, dpr } = this;
        const w = canvas.width / dpr,
            h = canvas.height / dpr;
        const s = this.view.scale;
        const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = dark ? '#14161a' : '#e9ecef';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = false;

        const span = 32 * REGION_SIZE * s;
        ctx.imageSmoothingEnabled = false;

        const { c0, r0, c1, r1 } = this.visibleChunks();
        const rx0 = floorDiv(c0, REGION_SIZE) - 1,
            rx1 = floorDiv(c1, REGION_SIZE) + 1,
            rz0 = floorDiv(r0, REGION_SIZE) - 1,
            rz1 = floorDiv(r1, REGION_SIZE) + 1;
        const regionBlockSpan = 32 * REGION_SIZE;
        const halfW = w * 0.5,
            halfH = h * 0.5;
        const vx = this.view.x,
            vz = this.view.z;

        // what the generator says of regions the save lacks goes underneath; whatever was read covers it
        for (const layer of [this.predicted, this.overview.coarse, this.overview.fine]) {
            for (let rz = rz0; rz <= rz1; rz++) {
                const oy = (rz * regionBlockSpan - vz) * s + halfH;
                if (oy > h || oy + span < 0) continue;
                for (let rx = rx0; rx <= rx1; rx++) {
                    const canvas = layer.get(`${rx}.${rz}`);
                    if (!canvas) continue;
                    const ox = (rx * regionBlockSpan - vx) * s + halfW;
                    if (ox > w || ox + span < 0) continue;
                    ctx.drawImage(canvas, ox, oy, span, span);
                }
            }
        }

        const originX = (c0 * 32 - vx) * s + halfW;
        const originY = (r0 * 32 - vz) * s + halfH;
        const size = 32 * s;
        // Far out, chunks are drawn from the overview alone; walking every visible chunk would cost more than the rest of the frame.
        const detailed = size >= DETAIL_MIN_PX;
        for (let z = r0; detailed && z <= r1; z++) {
            const sy = Math.floor(originY + (z - r0) * size);
            for (let x = c0; x <= c1; x++) {
                const tile = this.tiles.get(chunkKey(x, z));
                if (!tile) continue;
                // Whole pixels, with a hair of overlap, so chunks do not show seams at fractional zoom.
                const sx = Math.floor(originX + (x - c0) * size);
                ctx.drawImage(tile, sx, sy, Math.ceil(size) + 1, Math.ceil(size) + 1);
            }
        }

        if (this.spawnLayer.size) {
            ctx.save();
            ctx.globalAlpha = 0.42;
            for (let rz = rz0; rz <= rz1; rz++) {
                const oy = (rz * regionBlockSpan - vz) * s + halfH;
                if (oy > h || oy + span < 0) continue;
                for (let rx = rx0; rx <= rx1; rx++) {
                    const canvas = this.spawnLayer.get(`${rx}.${rz}`);
                    if (!canvas) continue;
                    const ox = (rx * regionBlockSpan - vx) * s + halfW;
                    if (ox > w || ox + span < 0) continue;
                    ctx.drawImage(canvas, ox, oy, span, span);
                }
            }
            ctx.restore();
        }

        const line = dark ? '255,255,255' : '0,0,0';
        if (this.options.chunkGrid && size >= 10) this.grid(32, `rgba(${line},0.18)`, 1);
        if (this.options.regionGrid) this.grid(32 * REGION_SIZE, `rgba(${line},0.5)`, 1.5);
        if (this.options.spawn) this.drawSpawn();
        if (this.options.markers) this.drawMarkers(this.getVisibleMarkers(), dark);
        if (this.spiderfy) this.drawSpiderfy(dark);
        if (this.options.players)
            for (const p of this.world.players) {
                const sc = this.toScreen(p.x, p.z);
                this.pinScreen(
                    sc.x,
                    sc.y,
                    playerColor(p),
                    p.name,
                    dark,
                    this.options.playerSkins === false
                        ? null
                        : playerHead(p, () => {
                              this.dirty = true;
                          })
                );
            }
        if (this.ruler.length) this.drawRuler(dark);
    }

    private drawRuler(dark: boolean) {
        const { ctx } = this;
        const pts = this.ruler.map((r) => this.toScreen(r.x, r.z));
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#f97316';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f97316';
            ctx.fill();
        }
        const [a, b] = this.ruler;
        if (!b) return;
        const label = `${Math.round(Math.hypot(b.x - a!.x, b.z - a!.z))} blocks`;
        const m = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
        ctx.strokeText(label, m.x + 6, m.y - 6);
        ctx.fillStyle = dark ? '#fff' : '#111';
        ctx.fillText(label, m.x + 6, m.y - 6);
    }

    private grid(step: number, color: string, width: number) {
        const { ctx } = this;
        const w = this.canvas.width / this.dpr,
            h = this.canvas.height / this.dpr;
        const a = this.toBlock(0, 0),
            b = this.toBlock(w, h);
        const halfW = w * 0.5,
            halfH = h * 0.5;
        const s = this.view.scale,
            vx = this.view.x,
            vz = this.view.z;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
            const sx = Math.round((x - vx) * s + halfW) + 0.5;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
        }
        for (let z = Math.floor(a.z / step) * step; z <= b.z; z += step) {
            const sy = Math.round((z - vz) * s + halfH) + 0.5;
            ctx.moveTo(0, sy);
            ctx.lineTo(w, sy);
        }
        ctx.stroke();
    }

    private pinScreen(
        sx: number,
        sy: number,
        fill: string,
        label: string | null,
        dark: boolean,
        head: HTMLImageElement | null = null
    ) {
        const { ctx } = this;
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        if (sx < -100 || sy < -100 || sx > w + 100 || sy > h + 100) return;

        if (head) {
            // a player with a skin: the face in a ring, where the dot would be
            const r = 14;
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(head, sx - r, sy - r, r * 2, r * 2);
            ctx.restore();
        } else {
            // Pin shadow / glow
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, 6.5, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1.5;
            ctx.fill();
            ctx.restore();

            // Pin border and center dot
            ctx.lineWidth = 2;
            ctx.strokeStyle = dark ? '#0f172a' : '#ffffff';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = dark ? '#ffffff' : '#0f172a';
            ctx.fill();
        }

        if (label) {
            ctx.save();
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const metrics = ctx.measureText(label);
            const textW = metrics.width;
            const badgeX = sx + (head ? 18 : 10);
            const badgeY = sy - 10;
            const badgeH = 20;
            const badgePadding = 6;
            const totalW = textW + badgePadding * 2;

            // Pill badge container
            ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)';
            ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            drawRoundRect(ctx, badgeX, badgeY, totalW, badgeH, 4);
            ctx.fill();
            ctx.stroke();

            // Label text
            ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
            ctx.fillText(label, badgeX + badgePadding, badgeY + 14);
            ctx.restore();
        }
    }

    private drawSpawn() {
        const sp = this.world.config.spawn;
        if (!sp) return;
        // when the generated spawn room is the spawn, it is already drawn (as a marker) and can be marked as done
        if (this.markerMemo?.list.some((m) => m.icon === 'Spawn' && Math.hypot(m.x - sp.x, m.z - sp.z) < 150)) return;
        const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
        const isHovered = this.mousePos
            ? Math.hypot(
                  this.toScreen(sp.x, sp.z).x - this.mousePos.x,
                  this.toScreen(sp.x, sp.z).y - this.mousePos.y
              ) <= 20
            : false;
        const label = this.view.scale >= 1.2 || isHovered ? 'Spawn' : null;
        this.drawOfficialIcon(sp.x, sp.z, 'Spawn', label, '#f59e0b', isHovered, dark);
    }

    // ---- places marked as done ----------------------------------------------------------------

    private completed = new Set<string>();
    private hideCompleted = false;
    private selectedId: string | null = null;

    /** The marker whose details are open: drawn on top, with its name. */
    setSelected(id: string | null) {
        this.selectedId = id;
        this.dirty = true;
    }

    /** The markers (by id) the person has finished: drawn faded, or left out when `hide`. */
    setCompleted(ids: ReadonlySet<string>, hide: boolean) {
        this.completed = new Set(ids);
        this.hideCompleted = hide;
        this.dirty = true;
    }

    private clusterMemo: {
        markers: MapMarker[];
        scale: number;
        filters: unknown;
        completed: Set<string>;
        hide: boolean;
        nodes: MarkerClusterNode[];
    } | null = null;

    /**
     * Groups markers that would overlap. Done in world units (the radius in pixels over the scale), so panning does not change the
     * groups: they are worked out again only when the markers, the zoom or the filters change, not on every frame.
     */
    private getClusters(markers: MapMarker[]): MarkerClusterNode[] {
        const filters = this.options.markerFilters;
        const memo = this.clusterMemo;
        if (
            !memo ||
            memo.markers !== markers ||
            memo.scale !== this.view.scale ||
            memo.filters !== filters ||
            memo.completed !== this.completed ||
            memo.hide !== this.hideCompleted
        ) {
            this.clusterMemo = {
                markers,
                scale: this.view.scale,
                filters,
                completed: this.completed,
                hide: this.hideCompleted,
                nodes: this.buildClusters(markers)
            };
        }
        const nodes = this.clusterMemo!.nodes;
        const halfW = (this.canvas.width / this.dpr) * 0.5;
        const halfH = (this.canvas.height / this.dpr) * 0.5;
        const scale = this.view.scale;
        const vx = this.view.x;
        const vz = this.view.z;
        for (const c of nodes) {
            c.screenX = (c.x - vx) * scale + halfW;
            c.screenY = (c.z - vz) * scale + halfH;
        }
        return nodes;
    }

    private buildClusters(markers: MapMarker[]): MarkerClusterNode[] {
        const filters = this.options.markerFilters;
        const validMarkers = markers.filter((m) => {
            if (this.hideCompleted && this.completed.has(m.id)) return false;
            const cat = getMarkerCategory(m);
            if (cat === 'commonMobs') return false;
            if (filters && !filters[cat]) return false;
            return true;
        });

        const priority: Record<string, number> = {
            dungeons: 10,
            uncommonMobs: 9,
            temples: 8,
            portals: 7,
            spawns: 6,
            farms: 5,
            user: 4,
            prefabs: 3,
            challenges: 4,
            encounters: 3,
            camps: 3,
            commonMobs: 0
        };
        validMarkers.sort((a, b) => (priority[getMarkerCategory(b)] ?? 1) - (priority[getMarkerCategory(a)] ?? 1));

        // Dynamic cluster radius based on zoom scale
        const radius = (this.view.scale >= 1.5 ? 20 : this.view.scale >= 0.8 ? 34 : 48) / this.view.scale;
        const clusters: MarkerClusterNode[] = [];
        const grid = new Map<string, MarkerClusterNode[]>();
        const cell = (v: number) => Math.floor(v / radius);

        for (const m of validMarkers) {
            const gx = cell(m.x),
                gz = cell(m.z);
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

    private drawMarkers(markers: MapMarker[], dark: boolean) {
        const clusters = this.getClusters(markers);
        const singles: {
            m: MapMarker;
            iconName: string;
            color: string;
            label: string | null;
            emphasized: boolean;
            screenX: number;
            screenY: number;
        }[] = [];
        let hoveredCluster: { node: MarkerClusterNode } | null = null;
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        const pad = 40;

        for (const c of clusters) {
            // Frustum cull offscreen clusters
            if (c.screenX < -pad || c.screenX > w + pad || c.screenY < -pad || c.screenY > h + pad) {
                continue;
            }

            // When spiderfied, the cluster's droplets and anchor are drawn by drawSpiderfy
            if (this.spiderfy && !this.spiderfy.collapsing) {
                const wdx = c.x - this.spiderfy.worldX;
                const wdz = c.z - this.spiderfy.worldZ;
                if (wdx * wdx + wdz * wdz < 25) {
                    continue;
                }
            }

            const mdx = this.mousePos ? c.screenX - this.mousePos.x : 0;
            const mdy = this.mousePos ? c.screenY - this.mousePos.y : 0;
            const hitR = c.markers.length > 1 ? (c.markers.length >= 100 ? 24 : c.markers.length >= 10 ? 20 : 18) : 20;
            const isHovered = this.mousePos ? mdx * mdx + mdy * mdy <= hitR * hitR : false;

            if (c.markers.length > 1) {
                if (isHovered) hoveredCluster = { node: c };
                else this.drawCluster(c, false, dark);
                continue;
            }
            const m = c.markers[0]!;
            const cat = getMarkerCategory(m);
            const iconName = markerIconName(m);

            let color = '#3b82f6';
            if (cat === 'spawns') color = '#f59e0b';
            else if (cat === 'temples') color = '#8b5cf6';
            else if (cat === 'dungeons' || cat === 'challenges') color = '#ef4444';
            else if (cat === 'uncommonMobs' || cat === 'encounters') color = '#f97316';
            else if (cat === 'camps') color = '#a16207';
            else if (cat === 'farms') color = '#10b981';
            else if (cat === 'portals') color = '#ec4899';
            else if (cat === 'user') color = '#06b6d4';

            // Names only for the few things worth finding from afar, or when close, or hovered: sixty ruins with a label each hide the map.
            const rare = cat === 'spawns' || cat === 'temples' || cat === 'portals';
            const emphasized = isHovered || m.id === this.selectedId;
            const label =
                (rare && this.view.scale >= 0.35) || this.view.scale >= 2.4 || emphasized
                    ? (this.options.markerLabel?.(m) ?? m.name) || null
                    : null;
            singles.push({ m, iconName, color, label, emphasized, screenX: c.screenX, screenY: c.screenY });
        }

        // Icons first, then the names, and what is hovered or selected last in each pass: a name is never covered by another icon.
        singles.sort((x, y) => Number(x.emphasized) - Number(y.emphasized));
        for (const s of singles) {
            const faded = this.completed.has(s.m.id) && !s.emphasized;
            if (faded) {
                this.ctx.save();
                this.ctx.globalAlpha = 0.4;
            }
            this.drawOfficialIconScreen(s.screenX, s.screenY, s.iconName, null, s.color, s.emphasized, dark);
            if (faded) this.ctx.restore();
        }
        for (const s of singles) {
            if (!s.label) continue;
            this.drawIconLabel(s.screenX, s.screenY, s.label, s.color, s.emphasized, dark);
        }
        if (hoveredCluster) this.drawCluster(hoveredCluster.node, true, dark);
    }

    private drawCluster(cluster: MarkerClusterNode, isHovered: boolean, dark: boolean) {
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        if (cluster.screenX < -50 || cluster.screenX > w + 50 || cluster.screenY < -50 || cluster.screenY > h + 50) {
            return;
        }

        const ctx = this.ctx;
        const count = cluster.markers.length;
        const p = { x: cluster.screenX, y: cluster.screenY };

        // Determine cluster accent color based on dominant category
        const accentColor = getClusterAccentColor(cluster.markers);

        let r = 16;
        let fontSize = 12;
        if (count >= 100) {
            r = 21;
            fontSize = 11;
        } else if (count >= 10) {
            r = 18;
            fontSize = 12;
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = isHovered ? 12 : 8;
        ctx.shadowOffsetY = 2;

        // Outer glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + (isHovered ? 5 : 3), 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(accentColor, dark ? (isHovered ? 0.35 : 0.22) : isHovered ? 0.25 : 0.15);
        ctx.fill();

        // Main disc
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
        ctx.fill();

        // Solid accent ring
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = isHovered ? 2.5 : 1.8;
        ctx.stroke();

        // Subtle inner ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, r - 3, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Count number
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
        ctx.fillText(String(count), p.x, p.y);
        ctx.restore();

        // Tooltip on hover
        if (isHovered) {
            const text = getClusterLabel(cluster.markers);
            ctx.save();
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const metrics = ctx.measureText(text);
            const bw = metrics.width + 16;
            const bh = 22;
            const bx = p.x - bw / 2;
            const by = p.y + r + 6;

            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;

            ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)';
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            drawRoundRect(ctx, bx, by, bw, bh, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, p.x, by + bh / 2);
            ctx.restore();
        }
    }

    private drawOfficialIcon(
        worldX: number,
        worldZ: number,
        iconName: string,
        label: string | null,
        fallbackColor: string,
        isHovered: boolean,
        dark: boolean
    ) {
        const p = this.toScreen(worldX, worldZ);
        this.drawOfficialIconScreen(p.x, p.y, iconName, label, fallbackColor, isHovered, dark);
    }

    private drawOfficialIconScreen(
        sx: number,
        sy: number,
        iconName: string,
        label: string | null,
        fallbackColor: string,
        isHovered: boolean,
        dark: boolean
    ) {
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) return;

        const img = getMarkerImage(this.options.markerIconUrl?.(iconName) ?? `/markers/${iconName}.png`, () => {
            this.dirty = true;
        });
        const ctx = this.ctx;

        if (img) {
            const sz = isHovered ? 30 : 28;
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
            ctx.shadowBlur = isHovered ? 12 : 8;
            ctx.shadowOffsetY = 2;

            // Round backing disc with subtle golden or slate rim
            ctx.beginPath();
            ctx.arc(sx, sy, sz / 2 + 1, 0, Math.PI * 2);
            ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)';
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#fbbf24' : fallbackColor;
            ctx.lineWidth = isHovered ? 2.5 : 1.5;
            ctx.stroke();

            // Draw official pixel-art icon from Hytale assets
            ctx.drawImage(img, sx - sz / 2, sy - sz / 2, sz, sz);
            ctx.restore();

            if (label) this.drawIconLabel(sx, sy, label, fallbackColor, isHovered, dark);
        } else {
            this.pinScreen(sx, sy, fallbackColor, label, dark);
        }
    }

    /** The name under a marker's icon. */
    private drawIconLabel(sx: number, sy: number, label: string, color: string, emphasized: boolean, dark: boolean) {
        const ctx = this.ctx;
        const size = emphasized ? 30 : 28;
        ctx.save();
        ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const width = ctx.measureText(label).width + 12;
        const height = 18;
        const x = sx - width / 2;
        const y = sy + size / 2 + 4;

        ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)';
        ctx.strokeStyle = emphasized ? color : dark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = emphasized ? 1.5 : 1;
        ctx.beginPath();
        drawRoundRect(ctx, x, y, width, height, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = dark ? '#f8fafc' : '#0f172a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, x + 6, y + 13);
        ctx.restore();
    }

    private drawSpiderfy(dark: boolean) {
        if (!this.spiderfy) return;
        const ctx = this.ctx;
        const origin = this.toScreen(this.spiderfy.worldX, this.spiderfy.worldZ);
        const accentColor = this.spiderfy.accentColor;

        // Central anchor droplet bead
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;

        // Glowing anchor halo
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(accentColor, dark ? 0.3 : 0.2);
        ctx.fill();

        // Central disc
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = dark ? '#0f172a' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Center bead dot
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
        ctx.restore();

        // Draw connecting elastic filaments and bloomed marker droplets
        for (const droplet of this.spiderfy.droplets) {
            const sx = origin.x + droplet.currentOffsetX;
            const sy = origin.y + droplet.currentOffsetY;

            // Draw elastic liquid connecting stem / filament from origin to droplet
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(sx, sy);
            ctx.strokeStyle = hexToRgba(accentColor, dark ? 0.7 : 0.45);
            ctx.lineWidth = 1.6;
            ctx.stroke();

            // Droplet elongation bead halfway
            const midX = origin.x + droplet.currentOffsetX * 0.52;
            const midY = origin.y + droplet.currentOffsetY * 0.52;
            ctx.beginPath();
            ctx.arc(midX, midY, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.fill();
            ctx.restore();

            // Check if hovered
            const isHovered = this.mousePos ? Math.hypot(sx - this.mousePos.x, sy - this.mousePos.y) <= 18 : false;

            // Get icon, color, label
            const m = droplet.marker;
            const cat = getMarkerCategory(m);
            const iconName = markerIconName(m);

            let color = '#3b82f6';
            if (cat === 'spawns') color = '#f59e0b';
            else if (cat === 'temples') color = '#8b5cf6';
            else if (cat === 'dungeons' || cat === 'challenges') color = '#ef4444';
            else if (cat === 'uncommonMobs' || cat === 'encounters') color = '#f97316';
            else if (cat === 'camps') color = '#a16207';
            else if (cat === 'farms') color = '#10b981';
            else if (cat === 'portals') color = '#ec4899';
            else if (cat === 'user') color = '#06b6d4';

            const label =
                isHovered || this.spiderfy.droplets.length <= 6
                    ? (this.options.markerLabel?.(m) ?? m.name) || null
                    : null;
            this.drawOfficialIconScreen(sx, sy, iconName, label, color, isHovered, dark);
        }
    }
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
}

function hexToRgba(hex: string, alpha: number): string {
    if (hex.startsWith('#')) {
        let clean = hex.slice(1);
        if (clean.length === 3) {
            clean = clean
                .split('')
                .map((ch) => ch + ch)
                .join('');
        }
        const num = parseInt(clean, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
}

export function getClusterAccentColor(markers: MapMarker[]): string {
    if (!markers.length) return '#f59e0b';
    const firstCat = getMarkerCategory(markers[0]!);
    const allSame = markers.every((m) => getMarkerCategory(m) === firstCat);
    if (allSame) {
        if (firstCat === 'dungeons') return '#ef4444';
        if (firstCat === 'uncommonMobs') return '#f97316';
        if (firstCat === 'temples') return '#8b5cf6';
        if (firstCat === 'farms') return '#10b981';
        if (firstCat === 'spawns') return '#f59e0b';
        if (firstCat === 'portals') return '#ec4899';
        if (firstCat === 'user') return '#06b6d4';
    }
    return '#f59e0b';
}

function getClusterLabel(markers: MapMarker[]): string {
    const n = markers.length;
    const firstCat = getMarkerCategory(markers[0]!);
    const allSame = markers.every((m) => getMarkerCategory(m) === firstCat);
    if (allSame) {
        const catNames: Record<string, string> = {
            dungeons: 'Dungeons',
            uncommonMobs: 'Bosses and rare mobs',
            temples: 'Temples',
            farms: 'Resources',
            spawns: 'Spawns',
            portals: 'Portals',
            prefabs: 'Ruins',
            user: 'Waypoints'
        };
        const name = catNames[firstCat] || 'Structures';
        return `${n} ${name} · Clique para aproximar`;
    }
    return `${n} structures · Click to zoom in`;
}

/** Mean colour of the opaque pixels of a chunk, as a CSS colour; `null` for an empty chunk. */
function averageColor(px: Uint8ClampedArray): string | null {
    let r = 0,
        g = 0,
        b = 0,
        n = 0;
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]! === 0) continue;
        r += px[i]!;
        g += px[i + 1]!;
        b += px[i + 2]!;
        n++;
    }
    return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : null;
}

const heads = new Map<string, { img: HTMLImageElement; failed: boolean }>();
const SKIN_API = 'https://api.hytl.skin/headshot';

/**
 * A player's face from the skin service (by id, then by name), or `null` while it loads and when the service does not know the
 * player: the plain pin is the fallback.
 */
function playerHead(p: { name: string; uuid?: string }, onLoaded: () => void): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    const key = p.uuid ?? p.name;
    let h = heads.get(key);
    if (!h) {
        const tries = [p.uuid, p.name].filter((v): v is string => !!v);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const entry = { img, failed: false };
        let n = 0;
        img.onload = onLoaded;
        img.onerror = () => {
            if (++n < tries.length) img.src = `${SKIN_API}/${encodeURIComponent(tries[n]!)}?size=64`;
            else entry.failed = true;
        };
        img.src = `${SKIN_API}/${encodeURIComponent(tries[0]!)}?size=64`;
        heads.set(key, (h = entry));
    }
    return !h.failed && h.img.complete && h.img.naturalWidth > 0 ? h.img : null;
}

const markerIcons = new Map<string, HTMLImageElement>();
function getMarkerImage(url: string, onLoaded?: () => void): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    let img = markerIcons.get(url);
    if (!img) {
        img = new Image();
        img.src = url;
        if (onLoaded) img.onload = onLoaded;
        markerIcons.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
}

const CATEGORIES = new Set([
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

const markerCategoryCache = new WeakMap<MapMarker, keyof MarkerFilters | 'commonMobs'>();

export function getMarkerCategory(m: MapMarker): keyof MarkerFilters | 'commonMobs' {
    let cat = markerCategoryCache.get(m);
    if (cat !== undefined) return cat;
    cat = computeMarkerCategory(m);
    markerCategoryCache.set(m, cat);
    return cat;
}

function computeMarkerCategory(m: MapMarker): keyof MarkerFilters | 'commonMobs' {
    if (m.category && CATEGORIES.has(m.category)) return m.category as keyof MarkerFilters;
    const name = (m.name || '').toLowerCase();
    const icon = (m.icon || '').toLowerCase();

    // Explicitly exclude common mob spawners (skeletons, spiders, zombies, goblins)
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
        name.includes('fazenda') ||
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
