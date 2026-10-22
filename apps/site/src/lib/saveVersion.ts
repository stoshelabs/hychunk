import type { SaveFingerprint } from '@hychunk/core';
import type { GameVersion } from '../gameData';

export interface Detected {
    id: string;
    /** `false` when no game version writes this chunk format, so the closest (the newest) was taken. */
    exact: boolean;
}

const newestFirst = (versions: GameVersion[]) =>
    [...versions].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

/**
 * The game version that wrote a save. The chunk format narrows it to the versions that write that format; among those, the
 * one that knows the most of the save's blocks wins, and the newest breaks a tie.
 */
export async function pickVersion(
    fingerprint: SaveFingerprint,
    versions: GameVersion[],
    blocksOf: (id: string) => Promise<Set<string>>
): Promise<Detected | null> {
    if (!versions.length) return null;
    const ordered = newestFirst(versions);
    const sameFormat = fingerprint.format === null ? [] : ordered.filter((v) => v.saveFormat === fingerprint.format);
    const candidates = sameFormat.length ? sameFormat : ordered;
    if (candidates.length === 1) return { id: candidates[0]!.id, exact: sameFormat.length > 0 };

    let best: { id: string; unknown: number } | null = null;
    for (const v of candidates) {
        const known = await blocksOf(v.id).catch(() => null);
        if (!known) continue;
        let unknown = 0;
        for (const name of fingerprint.blocks) if (name !== 'Empty' && !known.has(name)) unknown++;
        if (!best || unknown < best.unknown) best = { id: v.id, unknown };
    }
    return { id: (best ?? { id: candidates[0]!.id }).id, exact: sameFormat.length > 0 };
}
