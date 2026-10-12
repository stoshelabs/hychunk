import type { JsonNode } from '../noise/graph';

/**
 * Where the world's data files are read from: the `Server/World/Default` folder of the game's own
 * assets, however it is held. Paths are relative to that folder, with `/` separators.
 */
export interface Source {
    read(path: string): JsonNode;
    exists(path: string): boolean;
    /** Names (not paths) of what is directly inside a folder. */
    list(dir: string): string[];
    isDir(path: string): boolean;
}

/**
 * The data has a byte-order mark, `//` and `/* *\/` comments and a few trailing commas; the game's
 * reader accepts all of that. Strings are left alone, so a `//` inside a value survives.
 */
export function parseLenient(text: string): JsonNode {
    let out = '';
    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    while (i < text.length) {
        const c = text[i]!;
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j + 1;
        } else if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
        } else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end < 0 ? text.length : end + 2;
        } else {
            out += c;
            i++;
        }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export interface ZipLikeReader {
    entries?: Map<string, unknown>;
    list?(prefix?: string): string[];
    read(path: string): Promise<Uint8Array>;
}

export function memorySource(files: Record<string, JsonNode>): Source {
    const dirs = new Set<string>();
    for (const key of Object.keys(files)) {
        const parts = key.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    return {
        read(path: string) {
            const hit = files[path];
            if (!hit) throw new Error(`WorldGen file not found: ${path}`);
            return hit;
        },
        exists(path: string) {
            return path in files;
        },
        list(dir: string) {
            const prefix = dir ? (dir.endsWith('/') ? dir : dir + '/') : '';
            const names = new Set<string>();
            for (const key of Object.keys(files)) {
                if (key.startsWith(prefix)) {
                    const sub = key.slice(prefix.length);
                    const slash = sub.indexOf('/');
                    names.add(slash >= 0 ? sub.slice(0, slash) : sub);
                }
            }
            return [...names];
        },
        isDir(path: string) {
            const clean = path.endsWith('/') ? path.slice(0, -1) : path;
            return dirs.has(clean);
        }
    };
}

export async function extractWorldGenFiles(zip: ZipLikeReader, rootPrefix = 'Server/World/Default'): Promise<Record<string, JsonNode>> {
    const norm = rootPrefix ? (rootPrefix.endsWith('/') ? rootPrefix : rootPrefix + '/') : '';
    const files: Record<string, JsonNode> = {};
    const textDecoder = new TextDecoder();

    let paths: string[] = [];
    if (typeof zip.list === 'function') {
        paths = zip.list(norm);
    } else if (zip.entries) {
        paths = [...zip.entries.keys()].filter((p) => p.startsWith(norm));
    }

    for (const path of paths) {
        if (!path.startsWith(norm)) continue;
        const relPath = path.slice(norm.length);
        if (!relPath || !relPath.endsWith('.json')) continue;

        try {
            const bytes = await zip.read(path);
            const text = textDecoder.decode(bytes);
            files[relPath] = parseLenient(text);
        } catch (e) {
            console.warn(`[hychunk] Failed to load worldgen file ${path}:`, e);
        }
    }
    return files;
}

export async function createZipWorldSource(zip: ZipLikeReader, rootPrefix = 'Server/World/Default'): Promise<Source> {
    const files = await extractWorldGenFiles(zip, rootPrefix);
    return memorySource(files);
}
