export const STORAGE_KEYS = {
    gameVersion: 'hychunk.gameVersion',
    hideDone: 'hychunk.hideDone',
    done: (worldKey: string) => `hychunk.done.${worldKey}`
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
