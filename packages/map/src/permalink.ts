export interface ViewState {
    x: number;
    z: number;
    /** Pixels per block. */
    scale: number;
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

/** Writes a view as a URL fragment, e.g. `x=120&z=-45&s=1.5`. */
export function formatView(v: ViewState): string {
    return `x=${Math.round(v.x)}&z=${Math.round(v.z)}&s=${round(v.scale, 2)}`;
}

/** Reads a fragment made by {@link formatView}; undefined when it does not hold a position. */
export function parseView(hash: string): ViewState | undefined {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const x = Number(p.get('x')),
        z = Number(p.get('z'));
    if (!p.has('x') || !p.has('z') || !Number.isFinite(x) || !Number.isFinite(z)) return undefined;
    const s = Number(p.get('s'));
    return { x, z, scale: Number.isFinite(s) && s > 0 ? s : 1.5 };
}

/** Reads typed coordinates: "120 -45", "120, -45" or "x 120 z -45". */
export function parseCoordinates(text: string): { x: number; z: number } | undefined {
    const n = text.match(/-?\d+(?:\.\d+)?/g);
    if (!n || n.length < 2) return undefined;
    // A third number is a height (x y z): the horizontal pair is first and last.
    const x = Number(n[0]),
        z = Number(n[n.length === 2 ? 1 : n.length - 1]);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : undefined;
}
