/** Blocks along one side of a chunk. */
export const CHUNK_SIZE = 32;

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const regionKey = (rx: number, rz: number) => `${rx}.${rz}`;
export const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** Parses a `regionKey` without allocating. */
export function parseRegionKey(key: string): { rx: number; rz: number } {
    const dot = key.indexOf('.', 1);
    return { rx: Number(key.slice(0, dot)), rz: Number(key.slice(dot + 1)) };
}

/** A canvas holding `size` × `size` RGBA pixels. */
export function pixelCanvas(pixels: Uint8ClampedArray, size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas
        .getContext('2d')!
        .putImageData(new ImageData(pixels as unknown as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
    return canvas;
}

export function warn(what: string, error: unknown) {
    console.warn(`[hychunk] ${what} failed`, error);
}
