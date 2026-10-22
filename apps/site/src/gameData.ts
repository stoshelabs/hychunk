import type { MapStyle } from '@hychunk/core';
import type { PrefabTable, PrefabTops, SpawnTable } from '@hychunk/worldgen';

// The data the map needs from the game, as packs per game version served next to the site (`public/gamedata/<version>/`):
// the generator's JSON files, the extent of each prefab, the spawn tables and the block colours. Nothing has to be picked.
// `index.json` lists the versions; the map says which one it draws.

export interface GameVersion {
    id: string;
    label: string;
    /** `BlockChunk.Version` of the saves this game version writes. */
    saveFormat?: number;
}
export interface GameVersions {
    latest: string;
    versions: GameVersion[];
}

export interface GameData {
    id: string;
    worldgen: Record<string, unknown>;
    prefabs: PrefabTable;
    spawns: SpawnTable;
    style: MapStyle;
    /** The top of each column of the drawn structures. */
    tops: PrefabTops;
}

/** Where a portal block leads, and the instance worlds the pack holds (see `gameData.portals.ts` in the worldgen package). */
export interface PortalTable {
    blocks: Record<string, { kind: 'instance' | 'return'; instance?: string }>;
    instances: Record<
        string,
        {
            title: string;
            subtitle?: string;
            titleKey?: string;
            subtitleKey?: string;
            openable: boolean;
            regions: string[];
            spawn: { x: number; y: number; z: number } | null;
        }
    >;
}

const base = () => `${import.meta.env.BASE_URL}gamedata/`;

const PACK_CACHE = 'hychunk-gamedata-1';

/**
 * Packs of a game version rarely change, so they are served from the browser's cache at once and refreshed behind the scenes: a
 * repeat visit does not wait for the network (the next visit gets the refreshed copy). Without the Cache API it is a plain fetch.
 */
async function fetchPack(url: string): Promise<Response> {
    if (typeof caches === 'undefined' || new URL(url, location.href).origin !== location.origin) return fetch(url);
    try {
        const cache = await caches.open(PACK_CACHE);
        const keep = async (res: Response) => {
            if (res.ok) await cache.put(url, res.clone());
            return res;
        };
        // the list of versions is asked of the network first (a new version shows at once); the copy is for when offline
        if (url.endsWith('/index.json'))
            return await fetch(url).then(keep, async () => (await cache.match(url)) ?? Promise.reject(new Error(url)));
        const hit = await cache.match(url);
        const fresh = fetch(url).then(keep);
        if (hit) {
            fresh.catch(() => {}); // the refresh is allowed to fail
            return hit;
        }
        return await fresh;
    } catch {
        return fetch(url);
    }
}

async function json<T>(url: string): Promise<T> {
    const res = await fetchPack(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    // Packs are stored gzipped; a server that already decodes them sends the plain JSON.
    if (url.endsWith('.gz') && res.headers.get('content-encoding') !== 'gzip') {
        const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text()) as T;
    }
    return (await res.json()) as T;
}

async function bytes(url: string): Promise<ArrayBuffer> {
    const res = await fetchPack(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    if (res.headers.get('content-encoding') === 'gzip') return res.arrayBuffer();
    return new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** The names of the blocks a game version has, from its style pack (small), for telling which version wrote a save. */
export async function loadBlockNames(id: string): Promise<Set<string>> {
    const style = await json<MapStyle>(`${base()}${id}/style.json.gz`);
    return new Set(Object.keys(style.blocks));
}

export const loadGameVersions = () => json<GameVersions>(`${base()}index.json`);

export async function loadGameData(id: string): Promise<GameData> {
    const dir = `${base()}${id}/`;
    const [worldgen, prefabs, spawns, style, topsMeta, topsBin] = await Promise.all([
        json<Record<string, unknown>>(`${dir}worldgen.json.gz`),
        json<PrefabTable>(`${dir}prefabs.json.gz`),
        json<SpawnTable>(`${dir}spawns.json.gz`),
        json<MapStyle>(`${dir}style.json.gz`),
        json<{ names: string[]; index: Record<string, [number, number]> }>(`${dir}tops.json.gz`),
        bytes(`${dir}tops.bin.gz`)
    ]);
    return { id, worldgen, prefabs, spawns, style, tops: { ...topsMeta, data: new Int16Array(topsBin) } };
}

/** The portal table of a game version; a pack without one has no destinations to show. */
export const loadPortals = (id: string) => json<PortalTable>(`${base()}${id}/portals.json`).catch(() => null);

/** Where the chunks of an instance of a game version are served from (`<base>/chunks/X.Z.region.bin`, `config.json`, `resources/`). */
export const instanceUrl = (id: string, instance: string) =>
    new URL(`${base()}${id}/instances/${instance}`, location.href).href;

/** The game's texts of a language for a game version (`lang/<locale>.json`), or `null` when the pack has none. */
export const loadLang = (id: string, locale: string) =>
    json<Record<string, string>>(`${base()}${id}/lang/${locale}.json`).catch(() => null);
