import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromUrl } from './source';

const file = Uint8Array.from({ length: 100 }, (_, i) => i);

/** A server that answers `Range` (`ranges`) or, like GitHub Pages compressing its files, always sends the whole file. */
function serve(ranges: boolean) {
    const calls: (string | null)[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
        const range = new Headers(init?.headers).get('Range');
        calls.push(range);
        const m = /bytes=(\d+)-(\d+)/.exec(range ?? '');
        if (!ranges || !m) return new Response(file.slice(), { status: 200 });
        const [a, b] = [Number(m[1]), Number(m[2])];
        return new Response(file.slice(a, b + 1), {
            status: 206,
            headers: { 'Content-Range': `bytes ${a}-${b}/${file.length}` }
        });
    });
    return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('fromUrl', () => {
    it('reads ranges from a server that honours them', async () => {
        const calls = serve(true);
        const src = await fromUrl('x');
        expect(src.size).toBe(100);
        expect([...(await src.read(10, 3))]).toEqual([10, 11, 12]);
        expect(calls).toEqual(['bytes=0-0', 'bytes=10-12']);
    });

    it('downloads the whole file once from a server that ignores ranges', async () => {
        const calls = serve(false);
        const src = await fromUrl('x');
        expect(src.size).toBe(100);
        expect([...(await src.read(10, 3))]).toEqual([10, 11, 12]);
        expect([...(await src.read(98, 2))]).toEqual([98, 99]);
        expect(calls).toHaveLength(1);
    });
});
