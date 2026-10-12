import { openZipPack } from '../packages/core/src/index.ts';
import { fromPath } from '../packages/core/src/node.ts';
import { extractWorldGenFiles } from '../packages/worldgen/src/index.ts';

/** The generator's data files, read from the Assets.zip named by HYCHUNK_ASSETS. */
export async function loadWorldGenFiles() {
    const path = process.env.HYCHUNK_ASSETS;
    if (!path) throw new Error('Set HYCHUNK_ASSETS=/path/to/Assets.zip');
    const pack = await openZipPack('Assets.zip', await fromPath(path));
    return extractWorldGenFiles(pack as any);
}
