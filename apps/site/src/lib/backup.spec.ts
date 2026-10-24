import { describe, it, expect, beforeEach } from 'vitest';
import { buildBackupData, restoreBackup, parseBackupJson, type HyChunkBackup } from './backup';

describe('backup', () => {
    beforeEach(() => {
        // Clear mock localStorage
        const storage: Record<string, string> = {};
        globalThis.localStorage = {
            getItem: (key: string) => storage[key] ?? null,
            setItem: (key: string, val: string) => {
                storage[key] = String(val);
            },
            removeItem: (key: string) => {
                delete storage[key];
            },
            clear: () => {
                for (const k of Object.keys(storage)) delete storage[k];
            },
            get length() {
                return Object.keys(storage).length;
            },
            key: (i: number) => Object.keys(storage)[i] ?? null
        } as Storage;
    });

    it('builds backup data correctly', () => {
        localStorage.setItem('hychunk.done.seed-12345', JSON.stringify(['temple_1', 'dungeon_scarak']));

        const backup = buildBackupData({
            id: 'seed-12345',
            name: 'Seed 12345',
            seed: 12345,
            completed: ['temple_1', 'dungeon_scarak']
        });

        expect(backup.version).toBe(1);
        expect(backup.summary.totalWorlds).toBe(1);
        expect(backup.summary.totalCompletedPlaces).toBe(2);
        expect(backup.worlds['seed-12345']?.completed).toEqual(['temple_1', 'dungeon_scarak']);
    });

    it('restores backup data and merges with existing entries', () => {
        localStorage.setItem('hychunk.done.seed-12345', JSON.stringify(['temple_1']));

        const mockBackup: HyChunkBackup = {
            $schema: 'https://stoshelabs.github.io/hychunk/schema/backup-v1.json',
            version: 1,
            app: 'HyChunk',
            exportedAt: new Date().toISOString(),
            summary: { totalWorlds: 1, totalCompletedPlaces: 2 },
            worlds: {
                'seed-12345': {
                    worldKey: 'seed-12345',
                    seed: 12345,
                    completed: ['temple_1', 'camp_2'],
                    updatedAt: new Date().toISOString()
                }
            },
            preferences: {}
        };

        const result = restoreBackup(mockBackup, true);
        expect(result.restoredWorlds).toBe(1);
        expect(result.restoredPlaces).toBe(2);

        const restored = JSON.parse(localStorage.getItem('hychunk.done.seed-12345') ?? '[]');
        expect(restored).toContain('temple_1');
        expect(restored).toContain('camp_2');
    });

    it('parses backup JSON or throws on invalid data', () => {
        const validJson = JSON.stringify({
            version: 1,
            worlds: { 'seed-1': { completed: ['poi1'] } }
        });
        const parsed = parseBackupJson(validJson);
        expect(parsed.version).toBe(1);

        expect(() => parseBackupJson('{"random": true}')).toThrow();
    });
});
