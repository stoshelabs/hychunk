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

/** A colour for a player (`#rrggbb`) that stays the same for them: the ring around their face on the map and in the list. */
export function playerColor(p: { name: string; uuid?: string }): string {
    const text = p.uuid ?? p.name;
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    const hue = (h >>> 0) % 360;
    // hsl(hue, 75%, 55%) as hex
    const s = 0.75,
        l = 0.55,
        a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + hue / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
