export interface MapMarker {
    id: string;
    x: number;
    y: number;
    z: number;
    /** Display name; a translation key such as `server.items.Temple_Portal.name` is made readable. */
    name: string;
    icon: string | null;
    source: 'block' | 'user';
    /** The filter it belongs to, when the generator says so (otherwise it is guessed from the name and icon). */
    category?: string;
    /** Spawn markers inside it (names such as `Trork_Brawler`), for a structure. */
    spawns?: string[];
}

const pretty = (key: string) => {
    const m = /^server\.[^.]+\.(.+)\.name$/.exec(key);
    return (m ? m[1]! : key).replace(/_/g, ' ');
};

function fromEntry(id: string, e: any, source: MapMarker['source']): MapMarker | null {
    const p = e?.Position;
    if (!p || typeof p.X !== 'number' || typeof p.Z !== 'number') return null;
    return {
        id: e.MarkerId ?? id,
        x: p.X,
        y: p.Y ?? 0,
        z: p.Z,
        name: pretty(String(e.Name ?? '')),
        icon: e.Icon ?? null,
        source
    };
}

/** Markers from `resources/BlockMapMarkers.json` and `resources/SharedUserMapMarkers.json`; either may be missing. */
export function parseMarkers(blockMarkers?: unknown, userMarkers?: unknown): MapMarker[] {
    const out: MapMarker[] = [];
    const block = (blockMarkers as any)?.Markers ?? {};
    for (const [id, e] of Object.entries(block)) {
        const m = fromEntry(id, e, 'block');
        if (m) out.push(m);
    }
    const user = (userMarkers as any)?.UserMarkers;
    if (Array.isArray(user)) {
        user.forEach((e, i) => {
            const m = fromEntry(String(i), e, 'user');
            if (m) out.push(m);
        });
    }
    return out;
}
