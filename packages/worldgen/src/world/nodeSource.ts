import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { parseLenient, type Source } from './source';

/** A `Source` over a folder on disk; for tests and tools. */
export function folderSource(root: string): Source {
    return {
        read: (p) => parseLenient(readFileSync(`${root}/${p}`, 'utf8')),
        exists: (p) => existsSync(`${root}/${p}`),
        list: (d) => readdirSync(`${root}/${d}`),
        isDir: (p) => existsSync(`${root}/${p}`) && statSync(`${root}/${p}`).isDirectory()
    };
}
