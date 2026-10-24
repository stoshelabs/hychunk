import { downloadBlob } from './download';
import { readStorage, STORAGE_KEYS, writeStorage } from './storage';

export interface WorldBackupEntry {
    worldKey: string;
    name?: string;
    seed?: number | string | bigint;
    completed: string[];
    updatedAt: string;
}

export interface HyChunkBackup {
    $schema: string;
    version: number;
    app: string;
    exportedAt: string;
    summary: {
        totalWorlds: number;
        totalCompletedPlaces: number;
    };
    currentWorld?: {
        id?: string;
        name?: string;
        seed?: number | string | bigint;
        completed: string[];
    };
    worlds: Record<string, WorldBackupEntry>;
    preferences: {
        hideDone?: boolean;
        terrain?: boolean;
    };
}

export function collectAllWorldData(): Record<string, WorldBackupEntry> {
    const result: Record<string, WorldBackupEntry> = {};
    if (typeof localStorage === 'undefined') return result;
    const prefix = 'hychunk.done.';
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            const worldKey = key.slice(prefix.length);
            try {
                const list = JSON.parse(localStorage.getItem(key) ?? '[]');
                if (Array.isArray(list) && list.length > 0) {
                    let seed: string | number | undefined;
                    const seedMatch = /seed[-|](\d+)/i.exec(worldKey);
                    if (seedMatch) seed = Number(seedMatch[1]);
                    result[worldKey] = {
                        worldKey,
                        seed,
                        completed: list,
                        updatedAt: new Date().toISOString()
                    };
                }
            } catch {
                // ignore malformed entries
            }
        }
    }
    return result;
}

export function buildBackupData(currentWorldInfo?: {
    id?: string;
    name?: string;
    seed?: number | string | bigint;
    completed?: string[];
}): HyChunkBackup {
    const worlds = collectAllWorldData();

    if (currentWorldInfo?.id && currentWorldInfo.completed?.length) {
        worlds[currentWorldInfo.id] = {
            worldKey: currentWorldInfo.id,
            name: currentWorldInfo.name,
            seed: currentWorldInfo.seed,
            completed: currentWorldInfo.completed,
            updatedAt: new Date().toISOString()
        };
    }

    let totalCompleted = 0;
    for (const w of Object.values(worlds)) {
        totalCompleted += w.completed.length;
    }

    return {
        $schema: 'https://stoshelabs.github.io/hychunk/schema/backup-v1.json',
        version: 1,
        app: 'HyChunk',
        exportedAt: new Date().toISOString(),
        summary: {
            totalWorlds: Object.keys(worlds).length,
            totalCompletedPlaces: totalCompleted
        },
        currentWorld: currentWorldInfo
            ? {
                  id: currentWorldInfo.id,
                  name: currentWorldInfo.name,
                  seed: currentWorldInfo.seed,
                  completed: currentWorldInfo.completed ?? []
              }
            : undefined,
        worlds,
        preferences: {
            hideDone: readStorage(STORAGE_KEYS.hideDone) === '1',
            terrain: readStorage(STORAGE_KEYS.layerTerrain) === '1'
        }
    };
}

export function restoreBackup(
    backup: HyChunkBackup,
    merge = true
): { restoredWorlds: number; restoredPlaces: number } {
    let restoredWorlds = 0;
    let restoredPlaces = 0;
    for (const [worldKey, entry] of Object.entries(backup.worlds ?? {})) {
        if (!entry || !Array.isArray(entry.completed)) continue;
        const key = STORAGE_KEYS.done(worldKey);
        let list = entry.completed;
        if (merge) {
            try {
                const existing = JSON.parse(readStorage(key) ?? '[]');
                if (Array.isArray(existing)) {
                    list = [...new Set([...existing, ...entry.completed])];
                }
            } catch {
                // ignore
            }
        }
        writeStorage(key, JSON.stringify(list));
        restoredWorlds++;
        restoredPlaces += list.length;
    }
    return { restoredWorlds, restoredPlaces };
}

export function downloadJsonBackup(backup: HyChunkBackup, filename?: string) {
    const currentSeed = backup.currentWorld?.seed;
    const name = filename ?? (currentSeed ? `hychunk-backup-seed-${currentSeed}.json` : 'hychunk-backup.json');
    const text = JSON.stringify(backup, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    downloadBlob(blob, name);
}

export function parseBackupJson(text: string): HyChunkBackup {
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid JSON backup format: not an object');
    }
    if (!data.worlds && !data.currentWorld) {
        throw new Error('Invalid HyChunk backup format: missing worlds or currentWorld data');
    }
    return data as HyChunkBackup;
}
