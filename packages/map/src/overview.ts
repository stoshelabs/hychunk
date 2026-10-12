import { REGION_SIZE } from '@hychunk/core';

/**
 * The far-out picture: one pixel per chunk, one 32×32 canvas per region, in two layers.
 * `coarse` is a quick first guess painted in blocks from sampled chunks; `fine` holds
 * the real colour of every chunk that has been read, and is what gets saved.
 */
export class Overview {
    readonly fine = new Map<string, HTMLCanvasElement>();
    readonly coarse = new Map<string, HTMLCanvasElement>();

    private layer(map: Map<string, HTMLCanvasElement>, rx: number, rz: number) {
        const key = `${rx}.${rz}`;
        let c = map.get(key);
        if (!c) {
            c = document.createElement('canvas');
            c.width = c.height = REGION_SIZE;
            map.set(key, c);
        }
        return c.getContext('2d')!;
    }

    paintFine(rx: number, rz: number, lx: number, lz: number, rgb: string) {
        const ctx = this.layer(this.fine, rx, rz);
        ctx.fillStyle = rgb;
        ctx.fillRect(lx, lz, 1, 1);
    }

    /** Fills the `stride`×`stride` block this chunk stands for, only over chunks that exist. */
    paintCoarse(
        rx: number,
        rz: number,
        lx: number,
        lz: number,
        stride: number,
        rgb: string,
        exists: (lx: number, lz: number) => boolean
    ) {
        const ctx = this.layer(this.coarse, rx, rz);
        ctx.fillStyle = rgb;
        const x0 = lx - (lx % stride),
            z0 = lz - (lz % stride);
        for (let z = z0; z < Math.min(z0 + stride, REGION_SIZE); z++) {
            for (let x = x0; x < Math.min(x0 + stride, REGION_SIZE); x++) if (exists(x, z)) ctx.fillRect(x, z, 1, 1);
        }
    }

    /** Fine layer as RGBA bytes per region, for saving. */
    toBuffers(): Record<string, ArrayBuffer> {
        const out: Record<string, ArrayBuffer> = {};
        for (const [key, c] of this.fine)
            out[key] = c
                .getContext('2d')!
                .getImageData(0, 0, REGION_SIZE, REGION_SIZE)
                .data.buffer.slice(0) as ArrayBuffer;
        return out;
    }

    /** Loads saved layers; returns the chunks they already cover, as `cx,cz` keys. */
    fromBuffers(buffers: Record<string, ArrayBuffer>): Set<string> {
        const covered = new Set<string>();
        for (const [key, buf] of Object.entries(buffers)) {
            const [rx, rz] = key.split('.').map(Number) as [number, number];
            const data = new Uint8ClampedArray(buf);
            if (data.length !== REGION_SIZE * REGION_SIZE * 4) continue;
            this.layer(this.fine, rx, rz).putImageData(
                new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, REGION_SIZE, REGION_SIZE),
                0,
                0
            );
            for (let i = 0; i < REGION_SIZE * REGION_SIZE; i++) {
                if (data[i * 4 + 3]! > 0)
                    covered.add(
                        `${rx * REGION_SIZE + (i % REGION_SIZE)},${rz * REGION_SIZE + Math.floor(i / REGION_SIZE)}`
                    );
            }
        }
        return covered;
    }
}
