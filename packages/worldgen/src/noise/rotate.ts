// The game's coordinate rotation (`CoordinateRotator`) with its table-based sine and cosine
// (`TrigMathUtil`): 4096 float entries, so the angle is rounded to a step of about 0.0015 rad.

const f32 = Math.fround;
const BITS = 12;
const COUNT = 1 << BITS;
const MASK = COUNT - 1;
const RAD_FULL = f32(Math.PI * 2);
const RAD_TO_INDEX = f32(COUNT / RAD_FULL);
const DEG_TO_INDEX = f32(COUNT / 360);

const SIN = new Float32Array(COUNT);
const COS = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
    const a = f32(f32(f32(i + 0.5) / COUNT) * RAD_FULL);
    SIN[i] = Math.sin(a);
    COS[i] = Math.cos(a);
}
for (let i = 0; i < 360; i += 90) {
    const at = Math.trunc(f32(i * DEG_TO_INDEX)) & MASK;
    SIN[at] = Math.sin((i * Math.PI) / 180);
    COS[at] = Math.cos((i * Math.PI) / 180);
}

const index = (rad: number) => Math.trunc(f32(f32(rad) * RAD_TO_INDEX)) & MASK;
export const trigSin = (rad: number) => SIN[index(rad)]!;
export const trigCos = (rad: number) => COS[index(rad)]!;

export interface Rotator {
    x(x: number, y: number): number;
    y(x: number, y: number): number;
}

/** From degrees of pitch and yaw as they are written in the data; undefined when both are zero. */
export function rotator(pitchDeg: number, yawDeg: number, origin?: [number, number, number]): Rotator | undefined {
    const pitch = pitchDeg * 0.01745329238474369, yaw = yawDeg * 0.01745329238474369;
    if (pitch === 0 && yaw === 0) return undefined;
    const sy = trigSin(yaw), cy = trigCos(yaw), sp = trigSin(pitch), cp = trigCos(pitch);
    const dot = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => x1 * x2 + y1 * y2 + z1 * z2;
    const m = [
        dot(1, 0, 0, cy, 0, -sy), dot(1, 0, 0, 0, 1, 0), dot(1, 0, 0, sy, 0, cy),
        dot(0, cp, -sp, cy, 0, -sy), dot(0, cp, -sp, 0, 1, 0), dot(0, cp, -sp, sy, 0, cy),
        dot(0, sp, cp, cy, 0, -sy), dot(0, sp, cp, 0, 1, 0), dot(0, sp, cp, sy, 0, cy)
    ];
    if (origin && (origin[0] !== 0 || origin[1] !== 0 || origin[2] !== 0)) throw new Error('A rotation around an origin is not supported yet');
    return { x: (x, y) => x * m[0]! + y * m[2]!, y: (x, y) => x * m[6]! + y * m[8]! };
}
