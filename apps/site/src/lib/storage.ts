export const STORAGE_KEYS = {
    hideDone: 'hychunk.hideDone',
    done: (worldKey: string) => `hychunk.done.${worldKey}`,
    section: (id: string) => `hychunk.section.${id}`,
    ignoreCacheWarning: 'hychunk.ignoreCacheWarning',
    layerTerrain: 'hychunk.layer.terrain',
    googleClientId: 'hychunk.google.clientId',
    googleDriveFileId: 'hychunk.google.driveFileId',
    googleLastSync: 'hychunk.google.lastSync'
};

export function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // storage is unavailable in some private windows; the preference just does not persist
    }
}
