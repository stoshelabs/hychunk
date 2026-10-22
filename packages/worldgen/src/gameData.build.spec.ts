// Not a test: writes the data pack of one game version, which the site loads instead of asking for the Assets.zip.
//   HYCHUNK_ASSETS=/path/Assets.zip HYCHUNK_SERVER_JAR=/path/HytaleServer.jar HYCHUNK_GAMEDATA_OUT=apps/site/public/gamedata \
//     pnpm exec vitest run packages/worldgen/src/gameData.build.spec.ts
// The pack holds the generator's JSON files (minus the cave node files, which the map does not read), the extent of each
// prefab, the spawn tables and the block colours. Each file is gzipped; `manifest.json` names the version, `index.json` lists them.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildBlockTable, openZipPack, toMapStyle } from '@hychunk/core';
import { fromPath } from '../../core/src/node';
import { describe, expect, it } from 'vitest';
import { extractWorldGenFiles } from './world/source';
import { buildPrefabTable, buildPrefabTops } from './world/prefabCatalog';
import { buildSpawnTable } from './world/spawns';
import { buildLang } from './gameData.lang';
import { buildPortals } from './gameData.portals';

const assets = process.env.HYCHUNK_ASSETS,
    jar = process.env.HYCHUNK_SERVER_JAR,
    out = process.env.HYCHUNK_GAMEDATA_OUT;

/** `BlockChunk.VERSION` of the jar: the version of the chunk format its saves are written in (a save can be matched to a pack by it). */
function saveFormatOf(path: string): number {
    const text = execFileSync(
        'javap',
        ['-constants', '-cp', path, 'com.hypixel.hytale.server.core.universe.world.chunk.BlockChunk'],
        { encoding: 'utf8' }
    );
    const hit = /static final int VERSION = (\d+);/.exec(text);
    if (!hit) throw new Error('BlockChunk.VERSION not found');
    return Number(hit[1]);
}

/** `Implementation-Version` and revision from the server jar's manifest. */
function versionOf(path: string): { version: string; revision: string } {
    const text = execFileSync('unzip', ['-p', path, 'META-INF/MANIFEST.MF'], { encoding: 'utf8' });
    const get = (k: string) => new RegExp(`^${k}: (.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
    return { version: get('Implementation-Version'), revision: get('Implementation-Revision-Id') };
}

describe.skipIf(!assets || !jar || !out)('game data pack', () => {
    it('is written', async () => {
        const { version, revision } = versionOf(jar!);
        const saveFormat = saveFormatOf(jar!);
        expect(version).toBeTruthy();
        const dir = `${out}/${version}`;
        mkdirSync(dir, { recursive: true });
        const pack = await openZipPack('Assets.zip', await fromPath(assets!));

        const all = await extractWorldGenFiles(pack as any);
        const worldgen = Object.fromEntries(
            Object.entries(all).filter(([p]) => !/(^|\/)Cave\//.test(p) || p.endsWith('/Cave/Caves.json'))
        );
        worldgen['Game.json'] = { gameVersion: version }; // read by `loadWorldGen`: some generator details changed between versions
        const prefabs = await buildPrefabTable(pack as any);
        const spawns = await buildSpawnTable(pack as any);
        const style = toMapStyle(await buildBlockTable([pack as any]));

        const files: Record<string, number> = {};
        const put = (name: string, value: unknown) => {
            const gz = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
            writeFileSync(`${dir}/${name}.json.gz`, gz);
            files[`${name}.json.gz`] = gz.length;
        };
        put('worldgen', worldgen);
        put('prefabs', prefabs);
        put('spawns', spawns);
        put('style', style);
        buildPortals(assets!, dir);
        buildLang(assets!, dir);
        const tops = await buildPrefabTops(pack as any);
        put('tops', { names: tops.names, index: tops.index });
        const topsBin = gzipSync(Buffer.from(tops.data.buffer, tops.data.byteOffset, tops.data.byteLength), {
            level: 9
        });
        writeFileSync(`${dir}/tops.bin.gz`, topsBin);
        files['tops.bin.gz'] = topsBin.length;
        writeFileSync(
            `${dir}/manifest.json`,
            JSON.stringify(
                {
                    id: version,
                    gameVersion: version,
                    revision,
                    saveFormat,
                    files,
                    counts: {
                        worldgenFiles: Object.keys(worldgen).length,
                        prefabs: Object.keys(prefabs.prefabs).length,
                        spawnTables: spawns.groups.length,
                        blocks: Object.keys(style.blocks).length
                    }
                },
                null,
                1
            )
        );

        const indexPath = `${out}/index.json`;
        const index: { latest: string; versions: { id: string; label: string; saveFormat?: number }[] } = existsSync(
            indexPath
        )
            ? JSON.parse(readFileSync(indexPath, 'utf8'))
            : { latest: version, versions: [] };
        const entry = index.versions.find((v) => v.id === version);
        if (entry) entry.saveFormat = saveFormat;
        else index.versions.push({ id: version, label: `Hytale ${version}`, saveFormat });
        index.versions.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        index.latest = index.versions[index.versions.length - 1]!.id;
        writeFileSync(indexPath, JSON.stringify(index, null, 1));
        console.log(`game data ${version} (${revision.slice(0, 8)}): ${JSON.stringify(files)}`);
    }, 600000);
});
