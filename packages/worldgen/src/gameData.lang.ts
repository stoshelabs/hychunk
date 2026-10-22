// The game's own texts the map shows (zone and region names, instance and portal names, item names, creature names), per language, for
// the data pack of a game version: `lang/<locale>.json`. The map uses them so its labels read as they do in the game.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const WANTED = /^(map\.|instances\.|portals\.|npcRoles\.[^.]+\.name$|items\.[^.]+\.name$)/;

/** Locales with a `server.lang`, from the Assets.zip. Returns the number of texts written per locale. */
export function buildLang(zip: string, dir: string): Record<string, number> {
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
    const out: Record<string, number> = {};
    mkdirSync(`${dir}/lang`, { recursive: true });
    for (const path of names) {
        const locale = /^Server\/Languages\/([^/]+)\/server\.lang$/.exec(path)?.[1];
        if (!locale) continue;
        const texts: Record<string, string> = {};
        const raw = execFileSync('unzip', ['-p', zip, path], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
        // a text may go on over several lines (a trailing backslash); the names wanted here are one line
        for (const line of raw.split('\n')) {
            const i = line.indexOf(' = ');
            if (i <= 0) continue;
            const key = line.slice(0, i);
            const value = line.slice(i + 3).trim();
            if (WANTED.test(key) && value && !value.endsWith('\\') && !value.includes('<msg')) texts[key] = value;
        }
        writeFileSync(`${dir}/lang/${locale}.json`, JSON.stringify(texts));
        out[locale] = Object.keys(texts).length;
    }
    return out;
}
