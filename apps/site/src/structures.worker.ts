import { loadWorldGen, makeCatalog, memorySource, type PrefabTable } from '@hychunk/worldgen';
import { DUNGEON_CAVES } from '@hychunk/core';

// Works out where the generator puts structures, away from the page: the unique ones and the monuments, square by square.
// The same generator runs in the chunk workers for the terrain; this one also reads the prefab table.

type Request =
    | { id: number; type: 'init'; files: Record<string, unknown>; table: PrefabTable | null; seed: number }
    | { id: number; type: 'unique' }
    | { id: number; type: 'caves'; x: number; z: number; size: number }
    | { id: number; type: 'square'; x: number; z: number; size: number };

let gen: ReturnType<ReturnType<typeof loadWorldGen>['forSeed']> | null = null;

self.onmessage = (e: MessageEvent<Request>) => {
    const m = e.data;
    try {
        if (m.type === 'init') {
            gen = loadWorldGen(memorySource(m.files as never), m.table ? makeCatalog(m.table) : undefined).forSeed(
                m.seed
            );
            (self as unknown as Worker).postMessage({ id: m.id, result: true });
        } else if (!gen) {
            throw new Error('The structure worker was not started');
        } else if (m.type === 'unique') {
            (self as unknown as Worker).postMessage({ id: m.id, result: gen.uniquePrefabs() });
        } else if (m.type === 'caves') {
            const entries = gen.caveEntries(
                { minX: m.x, minZ: m.z, maxX: m.x + m.size - 1, maxZ: m.z + m.size - 1 },
                (n) => DUNGEON_CAVES.test(n)
            );
            (self as unknown as Worker).postMessage({ id: m.id, result: entries });
        } else {
            const sites = gen.prefabSites(
                { minX: m.x, minZ: m.z, maxX: m.x + m.size - 1, maxZ: m.z + m.size - 1 },
                (k) => /^(Monuments|Npc)\./.test(k),
                8
            );
            (self as unknown as Worker).postMessage({ id: m.id, result: sites });
        }
    } catch (err) {
        (self as unknown as Worker).postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) });
    }
};
