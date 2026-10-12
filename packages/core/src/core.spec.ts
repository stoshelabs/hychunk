import { describe, expect, it } from 'vitest';
import {
    CorruptChunkError,
    decodeBson,
    describeGenerator,
    fromBytes,
    parseRegionName,
    parseWorldConfig,
    RegionFile
} from './index';
import { binEl, cstr, doc, docEl, int32El, region, strEl } from './testing';

describe('decodeBson', () => {
    it('reads nested documents, strings, ints and binary', () => {
        const d = decodeBson(doc(int32El('v', 3), strEl('s', 'hi'), docEl('in', doc(binEl('Data', [1, 2, 3])))));
        expect(d.v).toBe(3);
        expect(d.s).toBe('hi');
        expect([...((d.in as any).Data as Uint8Array)]).toEqual([1, 2, 3]);
    });
});

describe('RegionFile', () => {
    it('reads only the slots that hold a chunk', async () => {
        const r = await RegionFile.open(fromBytes(region({ 5: doc(int32El('a', 1)), 700: doc(strEl('b', 'x')) })));
        expect(r.slots()).toEqual([5, 700]);
        expect((await r.readChunk(5))!.a).toBe(1);
        expect((await r.readChunk(700))!.b).toBe('x');
        expect(await r.readChunk(6)).toBeNull();
    });

    it('reports a slot that points at garbage instead of failing the region', async () => {
        const bytes = region({ 5: doc(int32El('a', 1)) });
        const view = new DataView(bytes.buffer, bytes.byteOffset);
        view.setUint32(32 + 9 * 4, 2); // slot 9 -> segment 2, which holds no blob
        const r = await RegionFile.open(fromBytes(bytes));
        await expect(r.readChunk(9)).rejects.toBeInstanceOf(CorruptChunkError);
        expect((await r.readChunk(5))!.a).toBe(1);
    });

    it('rejects a file that is not a region', async () => {
        await expect(RegionFile.open(fromBytes(new Uint8Array(64)))).rejects.toThrow(/magic/);
    });
});

describe('world config', () => {
    it('reads seed and spawn', () => {
        const c = parseWorldConfig({
            Seed: 7,
            SpawnProvider: { SpawnPoint: { X: 1, Y: 2, Z: 3, Yaw: 4 } },
            WorldGen: { Name: 'Default' }
        });
        expect(c).toEqual({
            seed: 7,
            spawn: { x: 1, y: 2, z: 3, yaw: 4 },
            worldGen: 'Default',
            worldGenType: null,
            requiredPlugins: [],
            chunkStorage: null
        });
    });
    it('parses region names', () => {
        expect(parseRegionName('-1.-2.region.bin')).toEqual({ rx: -1, rz: -2 });
        expect(parseRegionName('config.json')).toBeNull();
    });
});

describe('decodeBson with unknown components', () => {
    it('reads types a mod might write instead of failing the chunk', () => {
        const dec128 = Buffer.concat([Buffer.from([0x13]), cstr('d'), Buffer.alloc(16, 7)]);
        const nul = Buffer.concat([Buffer.from([0x0a]), cstr('n')]);
        const d = decodeBson(doc(dec128, nul, int32El('after', 5)));
        expect(d.after).toBe(5);
        expect(d.n).toBeNull();
    });
});

describe('describeGenerator', () => {
    const gen = (WorldGen: unknown, RequiredPlugins: unknown = {}) =>
        describeGenerator(parseWorldConfig({ WorldGen, RequiredPlugins }));
    it('tells the built-in generators from ones a plugin brings', () => {
        expect(gen({ Type: 'Hytale', Name: 'Default' }).kind).toBe('default');
        expect(gen({ Type: 'Flat', Layers: [] }).kind).toBe('flat');
        expect(gen({ Type: 'Void' }).needsServer).toBe(false);
        expect(gen({ Type: 'Hytale', Name: 'Skylands' })).toMatchObject({ kind: 'custom', needsServer: true });
        expect(gen({ Type: 'MyPluginGen' })).toMatchObject({ kind: 'custom', needsServer: true });
    });
    it('lists required plugins', () => {
        expect(parseWorldConfig({ RequiredPlugins: { 'Acme:Gen': {} } }).requiredPlugins).toEqual(['Acme:Gen']);
    });
});
