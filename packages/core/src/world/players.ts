export interface PlayerPosition {
    name: string;
    /** The player's id (the name of their file in `universe/players`), for looking up their skin. */
    uuid?: string;
    x: number;
    y: number;
    z: number;
    /** When the save file was last written, in ms; the most recent player is where the map opens. */
    seen: number;
}

const pos = (p: any) =>
    p && typeof p.X === 'number' && typeof p.Z === 'number'
        ? { x: p.X as number, y: (p.Y as number) ?? 0, z: p.Z as number }
        : null;

/**
 * Where a player is in `world`, from a `universe/players/<uuid>.json`: the live
 * transform when they were last in that world, otherwise the position it
 * remembers for it. `null` when the player has never been there.
 */
export function parsePlayer(json: unknown, world: string, seen = 0, uuid?: string): PlayerPosition | null {
    const c = (json as any)?.Components;
    const data = c?.Player?.PlayerData;
    const name = c?.Nameplate?.Text;
    if (typeof name !== 'string') return null;
    const here = data?.World === world ? pos(c?.Transform?.Position) : null;
    const remembered = pos(data?.PerWorldData?.[world]?.LastPosition);
    const p = here ?? remembered;
    return p ? { name, ...(uuid ? { uuid } : {}), ...p, seen } : null;
}
