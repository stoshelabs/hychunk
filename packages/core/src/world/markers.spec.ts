import { describe, expect, it } from 'vitest';
import { parseMarkers } from './markers';

describe('parseMarkers', () => {
    it('reads block and user markers and makes names readable', () => {
        const m = parseMarkers(
            {
                Markers: {
                    a: {
                        Position: { X: -292, Y: 109, Z: 50 },
                        Name: 'server.items.Forgotten_Temple_Portal_Enter.name',
                        Icon: 'T.png',
                        MarkerId: 'id1'
                    }
                }
            },
            { UserMarkers: [{ Position: { X: 1, Y: 2, Z: 3 }, Name: 'Home' }] }
        );
        expect(m).toEqual([
            {
                id: 'id1',
                x: -292,
                y: 109,
                z: 50,
                name: 'Forgotten Temple Portal Enter',
                icon: 'T.png',
                source: 'block'
            },
            { id: '0', x: 1, y: 2, z: 3, name: 'Home', icon: null, source: 'user' }
        ]);
    });
    it('tolerates missing files and broken entries', () => {
        expect(parseMarkers(undefined, undefined)).toEqual([]);
        expect(parseMarkers({ Markers: { x: {} } })).toEqual([]);
    });
});
