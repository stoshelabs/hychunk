import { describe, expect, it } from 'vitest';
import { formatView, parseCoordinates, parseView } from './permalink';

describe('permalink', () => {
    it('round-trips a view', () => {
        expect(parseView('#' + formatView({ x: 120.4, z: -45.6, scale: 1.504 }))).toEqual({
            x: 120,
            z: -46,
            scale: 1.5
        });
    });
    it('ignores fragments without a position', () => {
        expect(parseView('')).toBeUndefined();
        expect(parseView('#x=1')).toBeUndefined();
        expect(parseView('#x=a&z=2')).toBeUndefined();
    });
    it('falls back to a default zoom', () => {
        expect(parseView('#x=1&z=2&s=-3')?.scale).toBe(1.5);
    });
    it('reads typed coordinates', () => {
        expect(parseCoordinates('120 -45')).toEqual({ x: 120, z: -45 });
        expect(parseCoordinates('x 12, z 34')).toEqual({ x: 12, z: 34 });
        expect(parseCoordinates('10 64 -20')).toEqual({ x: 10, z: -20 });
        expect(parseCoordinates('12')).toBeUndefined();
        expect(parseCoordinates('abc')).toBeUndefined();
    });
});
