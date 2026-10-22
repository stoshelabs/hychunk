import { describe, expect, it } from 'vitest';
import { atLeastVersion } from './gen';

describe('atLeastVersion', () => {
    it('compares dotted game versions', () => {
        expect(atLeastVersion('0.7.0', [0, 7, 0])).toBe(true);
        expect(atLeastVersion('0.7.0-pre.5.1', [0, 7, 0])).toBe(true);
        expect(atLeastVersion('0.10.2', [0, 7, 0])).toBe(true);
        expect(atLeastVersion('1.0.0', [0, 7, 0])).toBe(true);
        expect(atLeastVersion('0.6.9', [0, 7, 0])).toBe(false);
        expect(atLeastVersion('0.5.6', [0, 7, 0])).toBe(false);
        expect(atLeastVersion('', [0, 7, 0])).toBe(false);
    });
});
