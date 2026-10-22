/**
 * The path of a fly-to: the camera zooms out, crosses the distance and zooms in again, so a far target is reached by a smooth arc
 * instead of a slide over terrain that blurs past. It is the "smooth and efficient zooming and panning" curve of van Wijk and
 * Nuij, the one Leaflet's `flyTo` uses; `rho` is how much the camera zooms out (√2 balances speed and zoom).
 */
export interface Flight {
    /** Seconds the flight takes. */
    duration: number;
    /** The view `t` of the way through (0 to 1, already eased). */
    at(t: number): { x: number; z: number; scale: number };
}

export interface FlightInput {
    from: { x: number; z: number; scale: number };
    to: { x: number; z: number; scale: number };
    /** The width of the view in pixels. */
    width: number;
    rho?: number;
    /** Seconds per unit of path length; 0.8 is Leaflet's. */
    speed?: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 1.5);

export function planFlight({ from, to, width, rho = Math.SQRT2, speed = 0.8 }: FlightInput): Flight | null {
    const dx = to.x - from.x,
        dz = to.z - from.z;
    // the distance in pixels at the starting zoom
    const u1 = Math.hypot(dx, dz) * from.scale;
    if (u1 < 1) return null; // nowhere to fly: the caller just zooms
    const rho2 = rho * rho;
    const w0 = width;
    const w1 = width * (from.scale / to.scale);
    const r = (second: boolean) => {
        const sign = second ? -1 : 1;
        const sq = second ? w1 : w0;
        const m = w1 * w1 - w0 * w0 + sign * rho2 * rho2 * u1 * u1;
        const k = 2 * sq * rho2 * u1;
        const b = m / k;
        const n = Math.sqrt(b * b + 1) - b;
        return n < 1e-9 ? -18 : Math.log(n);
    };
    const r0 = r(false);
    const total = (r(true) - r0) / rho;
    const w = (s: number) => Math.cosh(r0) / Math.cosh(r0 + rho * s);
    const u = (s: number) => (w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / rho2)) / u1;
    return {
        duration: speed * total,
        at(t) {
            const s = easeOut(Math.min(1, Math.max(0, t))) * total;
            const along = t >= 1 ? 1 : u(s);
            return {
                x: from.x + dx * along,
                z: from.z + dz * along,
                scale: t >= 1 ? to.scale : from.scale / w(s)
            };
        }
    };
}
