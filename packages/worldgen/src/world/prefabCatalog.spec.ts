import { describe, expect, it } from 'vitest';
import { makeCatalog, walkOrder } from './prefabCatalog';

describe('walkOrder', () => {
    it('lists each folder newest first, files and sub-folders alike, depth first', () => {
        // the archive lists these in this order; the game walks the zip file system, whose children come back reversed
        const order = walkOrder(['A/one.json', 'A/two.json', 'A/Sub/x.json', 'A/Sub/y.json', 'A/three.json', 'B/z.json']);
        expect(order).toEqual(['B/z.json', 'A/three.json', 'A/Sub/y.json', 'A/Sub/x.json', 'A/two.json', 'A/one.json']);
    });

    it('is what a Folder.* key lists', () => {
        const table = { prefabs: Object.fromEntries(['Outpost.003', 'Outpost.002', 'Outpost.001'].map((n) => [n, [0, 0, 0, 0, 0, 0]])) } as any;
        expect(makeCatalog(table).resolve('Outpost.*').map((v) => v.name)).toEqual(['Outpost.003', 'Outpost.002', 'Outpost.001']);
    });
});
