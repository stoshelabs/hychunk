import { fromBlob, fromUrl } from '../storage/source';
import { RegionFile } from '../storage/region';
import { parseMarkers, type MapMarker } from './markers';
import { parsePlayer, type PlayerPosition } from './players';
import { parseRegionName, parseWorldConfig, type WorldConfig } from './config';

/**
 * Where a world's region files can be read from, in a form a Web Worker can be handed:
 * `File`s from a folder picker, or a URL prefix that serves `X.Z.region.bin` with `Range`.
 */
export type RegionSource = { kind: 'blobs'; files: Record<string, Blob> } | { kind: 'url'; base: string };

/** Opens `rx.rz` from a source; a worker keeps its own cache of the result. */
export function openRegionSource(source: RegionSource, rx: number, rz: number): Promise<RegionFile> {
    const key = `${rx}.${rz}`;
    if (source.kind === 'blobs') {
        const f = source.files[key];
        return f ? RegionFile.open(fromBlob(f)) : Promise.reject(new Error(`No region ${key}`));
    }
    return fromUrl(`${source.base.replace(/\/$/, '')}/${key}.region.bin`).then(RegionFile.open);
}

export interface WorldEntry {
    /** Folder path inside what was picked; unique even when two plugins ship a world of the same name. */
    id: string;
    name: string;
    /** `universe` for the server's own worlds, otherwise the plugin that ships it (`mods/<plugin>/worlds/...`). */
    source: string;
    regions: number;
}

export interface WorldData extends Omit<WorldEntry, 'regions'> {
    config: WorldConfig;
    markers: MapMarker[];
    /** Players who have been in this world, when the picked folder includes `universe/players`. */
    players: PlayerPosition[];
    /** Where a view should open: the most recent player, else the spawn, else the middle of the explored area. */
    start: { x: number; z: number; label: string };
    /** Region coordinates that have a file. */
    regions: { rx: number; rz: number }[];
    openRegion(rx: number, rz: number): Promise<RegionFile>;
    /** The same files, for handing to workers. */
    regionSource: RegionSource;
    /** Identifies these exact region files (path, sizes, modification times), for caching what is derived from them; `null` when that cannot be told. */
    cacheKey: string | null;
}

const base = (f: File) => f.name;
const rel = (f: File) =>
    ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/');
const readJson = async (f?: File) => {
    if (!f) return undefined;
    try {
        return JSON.parse(await f.text());
    } catch {
        return undefined;
    }
};

/**
 * Every world among the files: a folder with a `config.json` and a `chunks/` beside it.
 * That finds a picked world folder, `universe/worlds/*`, and worlds that plugins keep in
 * their own folders (`mods/<plugin>/worlds/*`), and leaves out a server's own `config.json`.
 */
export function listWorlds(files: File[]): WorldEntry[] {
    const chunkCount = new Map<string, number>();
    for (const f of files) {
        const path = rel(f);
        const i = path.lastIndexOf('/chunks/');
        if (i >= 0 || path.startsWith('chunks/')) {
            const dir = path.slice(0, i >= 0 ? i + 1 : 0);
            if (parseRegionName(base(f))) chunkCount.set(dir, (chunkCount.get(dir) ?? 0) + 1);
        }
    }
    const out: WorldEntry[] = [];
    for (const f of files) {
        if (base(f) !== 'config.json') continue;
        const dir = rel(f).slice(0, -'config.json'.length);
        const regions = chunkCount.get(dir);
        if (regions === undefined && !files.some((g) => rel(g).startsWith(`${dir}chunks/`))) continue;
        const mod = /(?:^|\/)mods\/([^/]+)\//.exec(dir);
        out.push({
            id: dir,
            name: dir.split('/').filter(Boolean).pop() ?? dir,
            source: mod ? mod[1]! : 'universe',
            regions: regions ?? 0
        });
    }
    // The server's own worlds first, `default` before the rest, then by plugin and name.
    return out.sort(
        (a, b) =>
            Number(b.source === 'universe') - Number(a.source === 'universe') ||
            Number(b.name === 'default') - Number(a.name === 'default') ||
            a.source.localeCompare(b.source) ||
            a.name.localeCompare(b.name)
    );
}

/**
 * Builds a world from the files a folder picker returns. `world` is an entry's `id` or name;
 * without it the server's `default` world is used, else the first world that has chunks.
 */
export async function loadWorldFromFiles(files: File[], world?: string): Promise<WorldData> {
    const worlds = listWorlds(files);
    const entry =
        worlds.find((w) => w.id === world) ??
        worlds.find((w) => w.name === world) ??
        worlds.find((w) => w.name === 'default' && w.regions) ??
        worlds.find((w) => w.regions) ??
        worlds[0];
    if (!entry) throw new Error("No world found: pick a folder that contains a world's config.json and chunks/.");
    const prefix = entry.id;
    const name = entry.name;
    const configFile = files.find((f) => rel(f) === `${prefix}config.json`);
    const inside = (f: File) => rel(f).startsWith(prefix);

    const regionFiles: Record<string, Blob> = {};
    const regions: { rx: number; rz: number }[] = [];
    for (const f of files) {
        if (!inside(f) || !rel(f).slice(prefix.length).startsWith('chunks/')) continue;
        const r = parseRegionName(base(f));
        if (!r) continue;
        regionFiles[`${r.rx}.${r.rz}`] = f;
        regions.push(r);
    }
    const resource = (n: string) => files.find((f) => inside(f) && rel(f) === `${prefix}resources/${n}`);
    const config = parseWorldConfig(await readJson(configFile));
    if (config.chunkStorage && config.chunkStorage !== 'Hytale') {
        throw new Error(`World "${name}" stores chunks as "${config.chunkStorage}", which HyChunk cannot read yet.`);
    }
    const players: PlayerPosition[] = [];
    const worldsAt = prefix.lastIndexOf('worlds/');
    if (worldsAt >= 0) {
        const playersDir = `${prefix.slice(0, worldsAt)}players/`;
        for (const f of files) {
            if (
                !rel(f).startsWith(playersDir) ||
                !f.name.endsWith('.json') ||
                rel(f).slice(playersDir.length).includes('/')
            )
                continue;
            const p = parsePlayer(await readJson(f), name, f.lastModified, f.name.replace(/\.json$/, ''));
            if (p) players.push(p);
        }
        players.sort((a, b) => b.seen - a.seen);
    }
    const markers = parseMarkers(
        await readJson(resource('BlockMapMarkers.json')),
        await readJson(resource('SharedUserMapMarkers.json'))
    );

    const open = new Map<string, Promise<RegionFile>>();
    const source: RegionSource = { kind: 'blobs', files: regionFiles };
    return {
        id: entry.id,
        name,
        source: entry.source,
        config,
        markers,
        players,
        start: startPoint(config, players, regions),
        regions,
        regionSource: source,
        cacheKey: `${entry.id}|${name}|${hashRegions(regionFiles)}`,
        openRegion(rx, rz) {
            const key = `${rx}.${rz}`;
            let p = open.get(key);
            if (!p) {
                p = openRegionSource(source, rx, rz);
                open.set(key, p);
            }
            return p;
        }
    };
}

/** The most recent player, else the spawn, else the middle of the explored regions. */
export function startPoint(config: WorldConfig, players: PlayerPosition[], regions: { rx: number; rz: number }[]) {
    if (players[0]) return { x: players[0].x, z: players[0].z, label: players[0].name };
    if (config.spawn) return { x: config.spawn.x, z: config.spawn.z, label: 'Spawn' };
    if (regions.length) {
        const rx = regions.reduce((a, r) => a + r.rx + 0.5, 0) / regions.length;
        const rz = regions.reduce((a, r) => a + r.rz + 0.5, 0) / regions.length;
        return { x: rx * 1024, z: rz * 1024, label: 'Centre' };
    }
    return { x: 0, z: 0, label: 'Origin' };
}

/** A short fingerprint of the region files: a changed or added file means a different key. */
function hashRegions(files: Record<string, Blob>): string {
    let h = 2166136261;
    for (const key of Object.keys(files).sort()) {
        const f = files[key] as File;
        for (const ch of `${key}:${f.size}:${f.lastModified ?? 0};`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    }
    return (h >>> 0).toString(36);
}
