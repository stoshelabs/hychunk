const DB = 'hychunk';
const STORE = 'overview';
const TILES = 'tiles';
const VERSION = 1;

interface Saved {
    version: number;
    regions: Record<string, ArrayBuffer>;
}

let opened: Promise<IDBDatabase | null> | null = null;

/** The database is opened once: every read and write of the map goes through it, and opening it each time is slow. */
function open(): Promise<IDBDatabase | null> {
    if (!opened) {
        // a database that never opens (blocked by another tab, a broken profile) is given up on, so the map goes on without a cache
        const p = Promise.race([
            openDatabase(),
            new Promise<null>((resolve) =>
                setTimeout(() => {
                    if (opened === p) opened = null;
                    resolve(null);
                }, 4000)
            )
        ]);
        opened = p;
    }
    return opened;
}

function openDatabase(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        try {
            const req = indexedDB.open(DB, 2);
            req.onupgradeneeded = () => {
                for (const name of [STORE, TILES])
                    if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
            };
            req.onsuccess = () => {
                req.result.onversionchange = () => {
                    req.result.close();
                    opened = null;
                };
                resolve(req.result);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null); // private windows and blocked storage
        }
    });
}

/** The overview this browser saved for a world, or `null`. Never throws: a cache that cannot be read is just a cold start. */
export async function loadOverview(key: string): Promise<Record<string, ArrayBuffer> | null> {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const req = db.transaction(STORE).objectStore(STORE).get(key);
            req.onsuccess = () => {
                const v = req.result as Saved | undefined;
                resolve(v && v.version === VERSION ? v.regions : null);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function saveOverview(key: string, regions: Record<string, ArrayBuffer>): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({ version: VERSION, regions } satisfies Saved, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** One region's rendered chunks as saved: which slots have one, and only those chunks' pixels, in slot order. */
export interface SavedRegion {
    version: number;
    /** Per slot: 0 not read yet, 1 pixels saved, 2 damaged in the save. */
    state: Uint8Array;
    pixels: ArrayBuffer;
}

const TILE_VERSION = 1;

export async function loadRegionTiles(key: string, rx: number, rz: number): Promise<SavedRegion | null> {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const req = db.transaction(TILES).objectStore(TILES).get(`${key}|${rx}.${rz}`);
            req.onsuccess = () => {
                const v = req.result as SavedRegion | undefined;
                resolve(v && v.version === TILE_VERSION ? v : null);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function saveRegionTiles(
    key: string,
    rx: number,
    rz: number,
    state: Uint8Array,
    pixels: ArrayBuffer
): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(TILES, 'readwrite');
            tx.objectStore(TILES).put(
                { version: TILE_VERSION, state, pixels } satisfies SavedRegion,
                `${key}|${rx}.${rz}`
            );
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve(); // out of space or blocked: the cache just stays smaller
        }
    });
}

const PREDICTED_VERSION = 1;

/** The far-out picture of one region (32 × 32 pixels, RGBA) worked out earlier from the generator, or `null`. */
export async function loadPredicted(key: string, rx: number, rz: number): Promise<Uint8ClampedArray | null> {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const req = db.transaction(TILES).objectStore(TILES).get(`pred|${key}|${rx}.${rz}`);
            req.onsuccess = () => {
                const v = req.result as { version: number; pixels: ArrayBuffer } | undefined;
                resolve(v && v.version === PREDICTED_VERSION ? new Uint8ClampedArray(v.pixels) : null);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function savePredicted(key: string, rx: number, rz: number, pixels: Uint8ClampedArray): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(TILES, 'readwrite');
            const copy = pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength);
            tx.objectStore(TILES).put({ version: PREDICTED_VERSION, pixels: copy }, `pred|${key}|${rx}.${rz}`);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** Forgets everything this browser saved. */
export async function clearCache(): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction([STORE, TILES], 'readwrite');
            tx.objectStore(STORE).clear();
            tx.objectStore(TILES).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

/** Structure markers worked out earlier for a world (by 512-block square), or `null`. */
export async function loadMarkerCells(key: string): Promise<Record<string, unknown[]> | null> {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const req = db.transaction(STORE).objectStore(STORE).get(`markers|${key}`);
            req.onsuccess = () =>
                resolve((req.result as { cells?: Record<string, unknown[]> } | undefined)?.cells ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function saveMarkerCells(key: string, cells: Record<string, unknown[]>): Promise<void> {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
        try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({ cells }, `markers|${key}`);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
}
