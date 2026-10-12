// What the generator needs to know about the game's prefab files, without keeping the files: where each one is
// (its name) and how far it reaches from its anchor. Built once from `Server/Prefabs` of an `Assets.zip`.

/** `[minX, maxX, minY, maxY, minZ, maxZ]` of the blocks, relative to the prefab's anchor, unrotated. */
export type PrefabBounds = [number, number, number, number, number, number];

/** A block worth marking on the map inside a prefab (a portal), relative to the anchor, unrotated. */
export interface PrefabMark { block: string; x: number; y: number; z: number }

export interface PrefabTable {
    /** Names such as `Monuments.Challenge.Grass.Combat.Challenge_Grass_Combat_001`, in the order the pack lists them. */
    prefabs: Record<string, PrefabBounds>;
    /** Only the prefabs that have such blocks. */
    marks?: Record<string, PrefabMark[]>;
    /** The spawn markers placed inside each prefab (`SpawnMarkerComponent`), by name; only prefabs that have some. */
    spawns?: Record<string, string[]>;
}

export interface PrefabVariant { name: string; bounds: PrefabBounds; marks: PrefabMark[]; spawns: string[] }

/** Blocks the map shows on their own: the doors to other worlds. */
const MARKED = /portal/i;

export interface PrefabCatalog {
    /** `WorldGenPrefabLoader.get`: a name, or `Folder.Name.*` for everything below that folder. */
    resolve(key: string): PrefabVariant[];
}

interface PackLike {
    list(prefix?: string): string[];
    read(path: string): Promise<Uint8Array>;
}

const ROOT = 'Server/Prefabs/';
const SUFFIX = '.prefab.json';

/**
 * The order the game walks a folder of the pack in (`Files.walkFileTree` over the zip file system): the children of each
 * folder, files and sub-folders alike, newest first, where "newest" is first appearance in the archive's listing. Which
 * variant a `Folder.*` key picks depends on it. Found by matching saved structures to the weighted draw that chose them.
 */
export function walkOrder(paths: string[]): string[] {
    interface Node { children: Map<string, Node> | null; path: string }
    const root: Node = { children: new Map(), path: '' };
    for (const path of paths) {
        let at = root;
        const parts = path.split('/');
        parts.forEach((part, i) => {
            if (!at.children!.has(part)) at.children!.set(part, { children: i < parts.length - 1 ? new Map() : null, path });
            at = at.children!.get(part)!;
        });
    }
    const out: string[] = [];
    const visit = (n: Node) => {
        for (const child of [...n.children!.values()].reverse()) {
            if (child.children) visit(child);
            else out.push(child.path);
        }
    };
    visit(root);
    return out;
}

/** Reads every prefab of the pack and keeps its extent. Slow (thousands of files); keep the result. */
export async function buildPrefabTable(pack: PackLike, progress?: (done: number, total: number) => void): Promise<PrefabTable> {
    const listed = pack.list(ROOT).filter((f) => f.endsWith(SUFFIX));
    // the table keeps the game's walk order: a `Folder.*` key lists its variants in that order
    const files = walkOrder(listed.map((f) => f.slice(ROOT.length))).map((f) => ROOT + f);
    const prefabs: Record<string, PrefabBounds> = {};
    const marks: Record<string, PrefabMark[]> = {};
    const spawns: Record<string, string[]> = {};
    const decoder = new TextDecoder();
    let done = 0;
    for (const file of files) {
        const json = JSON.parse(decoder.decode(await pack.read(file)));
        const ax: number = json.anchorX ?? 0, ay: number = json.anchorY ?? 0, az: number = json.anchorZ ?? 0;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const name = file.slice(ROOT.length, -SUFFIX.length).replace(/\//g, '.');
        for (const b of (json.blocks ?? []) as { x: number; y: number; z: number; name?: string }[]) {
            const x = b.x - ax, y = b.y - ay, z = b.z - az;
            if (b.name && MARKED.test(b.name)) (marks[name] ??= []).push({ block: b.name, x, y, z });
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const markers = new Set<string>();
        for (const e of (json.entities ?? []) as any[]) {
            const m = e?.Components?.SpawnMarkerComponent?.SpawnMarker;
            if (typeof m === 'string' && m) markers.add(m);
        }
        if (markers.size) spawns[name] = [...markers];
        if (minX === Infinity) { minX = maxX = minY = maxY = minZ = maxZ = 0; }
        prefabs[name] = [minX, maxX, minY, maxY, minZ, maxZ];
        progress?.(++done, files.length);
    }
    // a portal is a few blocks wide: one mark at the middle of each kind
    for (const [name, list] of Object.entries(marks)) {
        const by = new Map<string, PrefabMark[]>();
        for (const m of list) (by.get(m.block) ?? by.set(m.block, []).get(m.block)!).push(m);
        marks[name] = [...by].map(([block, ms]) => ({
            block,
            x: Math.round(ms.reduce((a, m) => a + m.x, 0) / ms.length),
            y: Math.round(ms.reduce((a, m) => a + m.y, 0) / ms.length),
            z: Math.round(ms.reduce((a, m) => a + m.z, 0) / ms.length)
        }));
    }
    return { prefabs, marks, spawns };
}

export function makeCatalog(table: PrefabTable): PrefabCatalog {
    const names = Object.keys(table.prefabs);
    const cache = new Map<string, PrefabVariant[]>();
    return {
        resolve(key) {
            const hit = cache.get(key);
            if (hit) return hit;
            let found: string[];
            if (key.endsWith('.*')) {
                const folder = key.slice(0, -1); // keeps the dot
                found = names.filter((n) => n.startsWith(folder));
            } else {
                found = names.filter((n) => n === key);
            }
            if (!found.length) throw new Error(`Failed to find prefab: ${key}`);
            const out = found.map((name) => ({ name, bounds: table.prefabs[name]!, marks: table.marks?.[name] ?? [], spawns: table.spawns?.[name] ?? [] }));
            cache.set(key, out);
            return out;
        }
    };
}


/** The top of every column of a prefab, for drawing structures on the map: `[x, z, y, name]` relative to the anchor, flat. */
export interface PrefabTops {
    /** Block names, indexed by the fourth number of each column. */
    names: string[];
    /** Prefab name -> `[first number, how many numbers]` in `data`. */
    index: Record<string, [number, number]>;
    /** Four numbers per column: x, z, y, name index. */
    data: Int16Array;
}

/** Which prefabs are drawn: the monuments and the camps and villages of the NPCs (`Npc.*`) at once, and the trees, rocks and plants in a second pass. */
export const MONUMENT_PREFABS = /^(Monuments|Npc)\./;
export const DECOR_PREFABS = /^(Trees|Rock_Formations|Plants)\./;
export const DRAWN_PREFABS = /^(Monuments|Npc|Spawn|Trees|Rock_Formations|Plants)\./;

export async function buildPrefabTops(pack: PackLike, accept: (name: string) => boolean = (n) => DRAWN_PREFABS.test(n)): Promise<PrefabTops> {
    const files = pack.list(ROOT).filter((f) => f.endsWith(SUFFIX));
    const decoder = new TextDecoder();
    const names = new Map<string, number>();
    const index: Record<string, [number, number]> = {};
    const chunks: number[][] = [];
    let total = 0;
    for (const file of files) {
        const name = file.slice(ROOT.length, -SUFFIX.length).replace(/\//g, '.');
        if (!accept(name)) continue;
        const json = JSON.parse(decoder.decode(await pack.read(file)));
        const ax: number = json.anchorX ?? 0, ay: number = json.anchorY ?? 0, az: number = json.anchorZ ?? 0;
        const top = new Map<number, [number, number, number, string]>();
        for (const b of (json.blocks ?? []) as { x: number; y: number; z: number; name?: string }[]) {
            if (!b.name || b.name === 'Empty') continue;
            const x = b.x - ax, z = b.z - az, y = b.y - ay, k = x * 65536 + z;
            const cur = top.get(k);
            if (!cur || y > cur[2]) top.set(k, [x, z, y, b.name.split('|')[0]!]);
        }
        const flat: number[] = [];
        for (const [x, z, y, n] of top.values()) {
            let id = names.get(n);
            if (id === undefined) names.set(n, (id = names.size));
            flat.push(x, z, y, id);
        }
        index[name] = [total, flat.length];
        chunks.push(flat);
        total += flat.length;
    }
    const data = new Int16Array(total);
    let at = 0;
    for (const c of chunks) { data.set(c, at); at += c.length; }
    return { names: [...names.keys()], index, data };
}
