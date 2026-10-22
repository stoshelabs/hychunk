import type { BsonDocument } from '../bson/reader';
import { readBlockSection, SECTION_COUNT } from './chunk';
import type { WorldData } from './source';

export interface SaveFingerprint {
    /** `BlockChunk.Version` of the sampled chunks: the version of the chunk format, which changes with some game updates. */
    format: number | null;
    /** The block names found in the sampled chunks. */
    blocks: Set<string>;
}

const MAX_REGIONS = 3;
const MAX_CHUNKS = 8;

/**
 * What a save says about the game that wrote it. A save does not store the game version, but its chunks do carry their format
 * version and the names of the blocks, which a game version either has or does not have.
 */
export async function inspectSave(world: Pick<WorldData, 'regions' | 'openRegion'>): Promise<SaveFingerprint> {
    const blocks = new Set<string>();
    let format: number | null = null;
    for (const { rx, rz } of world.regions.slice(0, MAX_REGIONS)) {
        let region;
        try {
            region = await world.openRegion(rx, rz);
        } catch {
            continue;
        }
        const slots = region.slots();
        const step = Math.max(1, Math.floor(slots.length / MAX_CHUNKS));
        for (let i = 0; i < slots.length; i += step) {
            let chunk: BsonDocument | null = null;
            try {
                chunk = await region.readChunk(slots[i]!);
            } catch {
                continue; // a damaged chunk
            }
            if (!chunk) continue;
            const version = (chunk.Components as BsonDocument | undefined)?.BlockChunk as BsonDocument | undefined;
            if (typeof version?.Version === 'number') format = Math.max(format ?? 0, version.Version);
            for (let s = 0; s < SECTION_COUNT; s++)
                for (const name of readBlockSection(chunk, s)?.names ?? []) blocks.add(name);
        }
    }
    return { format, blocks };
}
