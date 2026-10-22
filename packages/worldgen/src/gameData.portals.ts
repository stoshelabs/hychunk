// Where each portal block of the world leads, and the instance worlds that ship with their chunks, for the data pack of a game
// version (`portals.json` plus `instances/<name>/`). Read by the build spec and by `portals.build.spec.ts`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

export interface PortalBlock {
    kind: 'instance' | 'return';
    /** Instance name the block teleports to (`TeleportInstance.InstanceName`). */
    instance?: string;
}
export interface PortalInstance {
    title: string;
    subtitle?: string;
    /** Keys of the game's texts for them (`instances.forgotten_temple.title`), to show them in another language. */
    titleKey?: string;
    subtitleKey?: string;
    /** Whether the pack holds its chunks: an instance made on entry by a generator HyChunk lacks cannot be opened. */
    openable: boolean;
    regions: string[];
    spawn: { x: number; y: number; z: number } | null;
}
export interface PortalTable {
    blocks: Record<string, PortalBlock>;
    instances: Record<string, PortalInstance>;
}

const unzip = (zip: string, args: string[]) =>
    execFileSync('unzip', ['-p', zip, ...args], { maxBuffer: 256 * 1024 * 1024 });
const list = (zip: string) =>
    execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');

/** `key = value` lines of the English language file. */
function langOf(zip: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const line of unzip(zip, ['Server/Languages/en-US/server.lang']).toString('utf8').split('\n')) {
        const i = line.indexOf(' = ');
        if (i > 0) out.set(line.slice(0, i), line.slice(i + 3).trim());
    }
    return out;
}

export function buildPortals(zip: string, dir: string): PortalTable {
    const names = list(zip);
    const lang = langOf(zip);
    const json = (path: string) => JSON.parse(unzip(zip, [path]).toString('utf8')) as any;

    const blocks: PortalTable['blocks'] = {};
    for (const path of names.filter((n) => /^Server\/Item\/Items\/Portal\/.*\.json$/.test(n))) {
        const block = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
        const enter = json(path).BlockType?.Interactions?.CollisionEnter?.Interactions?.[0];
        if (enter?.Type === 'TeleportInstance' && typeof enter.InstanceName === 'string')
            blocks[block] = { kind: 'instance', instance: enter.InstanceName };
        // the return portal names its interaction in a file of its own
        else if (enter === 'Portal_Return' || enter?.Type === 'PortalReturn') blocks[block] = { kind: 'return' };
    }

    // a portal type (the keys the player uses) names the instance it makes and its title
    const types = new Map<string, string>();
    for (const path of names.filter((n) => /^Server\/PortalTypes\/.*\.json$/.test(n))) {
        const t = json(path);
        if (t.InstanceId && t.Description?.DisplayName) types.set(t.InstanceId, String(t.Description.DisplayName));
    }

    const instances: PortalTable['instances'] = {};
    for (const id of new Set(Object.values(blocks).flatMap((b) => (b.instance ? [b.instance] : [])))) {
        const root = `Server/Instances/${id}/`;
        const regions = names
            .filter((n) => n.startsWith(`${root}chunks/`) && n.endsWith('.region.bin'))
            .map((n) => n.slice(`${root}chunks/`.length, -'.region.bin'.length));
        const bson = names.includes(`${root}instance.bson`)
            ? unzip(zip, [`${root}instance.bson`]).toString('latin1')
            : '';
        const key = /server\.instances\.[A-Za-z0-9_]+\.title/.exec(bson)?.[0]?.replace(/^server\./, '');
        const portalKey = types.get(id)?.replace(/^server\./, '');
        const title =
            (key && lang.get(key)) || (portalKey && lang.get(portalKey)) || id.split('/').pop()!.replace(/_/g, ' ');
        const subtitleKey = key?.replace(/\.title$/, '.subtitle');
        const subtitle = subtitleKey ? lang.get(subtitleKey) : undefined;

        let spawn: PortalInstance['spawn'] = null;
        if (regions.length) {
            const config = json(`${root}config.json`);
            const p = config.SpawnProvider?.SpawnPoint;
            if (p) spawn = { x: p.X, y: p.Y, z: p.Z };
            const out = `${dir}/instances/${id}`;
            mkdirSync(`${out}/chunks`, { recursive: true });
            mkdirSync(`${out}/resources`, { recursive: true });
            writeFileSync(`${out}/config.json`, JSON.stringify(config));
            for (const r of regions)
                writeFileSync(`${out}/chunks/${r}.region.bin`, unzip(zip, [`${root}chunks/${r}.region.bin`]));
            const markers = `${root}resources/BlockMapMarkers.json`;
            if (names.includes(markers)) writeFileSync(`${out}/resources/BlockMapMarkers.json`, unzip(zip, [markers]));
        }
        const titleKey = key && lang.has(key) ? key : portalKey && lang.has(portalKey) ? portalKey : undefined;
        instances[id] = {
            title,
            ...(subtitle ? { subtitle } : {}),
            ...(titleKey ? { titleKey } : {}),
            ...(subtitle && subtitleKey ? { subtitleKey } : {}),
            openable: regions.length > 0,
            regions,
            spawn
        };
    }
    const table = { blocks, instances };
    writeFileSync(`${dir}/portals.json`, JSON.stringify(table, null, 1));
    return table;
}
