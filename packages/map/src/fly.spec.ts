import { describe, expect, it } from 'vitest';
import { planFlight } from './fly';

describe('planFlight', () => {
    const base = { from: { x: 0, z: 0, scale: 3 }, to: { x: 4000, z: -2000, scale: 3 }, width: 1000 };

    it('starts and ends on the given views', () => {
        const f = planFlight(base)!;
        const a = f.at(0),
            b = f.at(1);
        expect(a.x).toBeCloseTo(0, 5);
        expect(a.scale).toBeCloseTo(3, 5);
        expect(b).toEqual({ x: 4000, z: -2000, scale: 3 });
    });

    it('zooms out on the way and back in at the end, for a far target', () => {
        const f = planFlight(base)!;
        const lowest = Math.min(...Array.from({ length: 21 }, (_, i) => f.at(i / 20).scale));
        expect(lowest).toBeLessThan(1);
    });

    it('moves monotonically towards the target', () => {
        const f = planFlight(base)!;
        let last = -1;
        for (let i = 0; i <= 20; i++) {
            const p = f.at(i / 20);
            expect(p.x).toBeGreaterThanOrEqual(last);
            last = p.x;
        }
    });

    it('takes longer for a longer way, and has nothing to fly for a point where it already is', () => {
        const far = planFlight({ ...base, to: { x: 40000, z: 0, scale: 3 } })!;
        expect(far.duration).toBeGreaterThan(planFlight(base)!.duration);
        expect(planFlight({ ...base, to: { ...base.from } })).toBeNull();
    });
});
