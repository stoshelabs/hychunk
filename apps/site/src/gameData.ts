import type { MapStyle } from '@hychunk/core';
import type { PrefabTable, PrefabTops, SpawnTable } from '@hychunk/worldgen';

// The data the map needs from the game, as packs per game version served next to the site (`public/gamedata/<version>/`):
// the generator's JSON files, the extent of each prefab, the spawn tables and the block colours. Nothing has to be picked.
// `index.json` lists the versions; the map says which one it draws.

export interface GameVersion {
    id: string;
    label: string;
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

const base = () => `${import.meta.env.BASE_URL}gamedata/`;

async function json<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    // Packs are stored gzipped; a server that already decodes them sends the plain JSON.
    if (url.endsWith('.gz') && res.headers.get('content-encoding') !== 'gzip') {
        const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text()) as T;
    }
    return (await res.json()) as T;
}

async function bytes(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    if (res.headers.get('content-encoding') === 'gzip') return res.arrayBuffer();
    return new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
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
