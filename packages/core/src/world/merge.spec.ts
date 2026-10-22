import { describe, expect, it } from 'vitest';
import { mergeGroups, siteGroup } from './poi';
import type { MapMarker } from './markers';

const marker = (id: string, x: number, z: number, group?: string, name = 'Ruined city · gatehouse'): MapMarker => ({
    id,
    name,
    x,
    y: 70,
    z,
    source: 'block',
    icon: null,
    category: 'encounters',
    ...(group ? { group } : {})
});

describe('mergeGroups', () => {
    it('makes one place of the pieces of a ruined city', () => {
        const merged = mergeGroups([
            marker('a', 100, 100, 'city-ruins'),
            marker('b', 180, 140, 'city-ruins', 'Ruined city · temple'),
            marker('c', 5000, 5000, 'city-ruins')
        ]);
        expect(merged).toHaveLength(2);
        const city = merged.find((m) => m.x < 1000)!;
        expect(city.name).toBe('Ruined city');
        expect([city.x, city.z]).toEqual([100, 100]);
    });

    it('chains pieces that touch through a third one', () => {
        const merged = mergeGroups([
            marker('a', 0, 0, 'city-ruins'),
            marker('b', 190, 0, 'city-ruins'),
            marker('c', 380, 0, 'city-ruins')
        ]);
        expect(merged).toHaveLength(1);
    });

    it('leaves markers without a group, and other groups, alone', () => {
        const merged = mergeGroups([
            marker('a', 0, 0),
            marker('b', 10, 10),
            marker('c', 0, 0, 'cave:Goblin_Lair', 'Goblin lair'),
            marker('d', 50, 0, 'cave:Mineshaft', 'Mineshaft')
        ]);
        expect(merged).toHaveLength(4);
    });

    it('merges the entrances of one dungeon type but keeps its name', () => {
        const merged = mergeGroups([
            marker('a', 0, 0, 'cave:Goblin_Lair', 'Goblin lair'),
            marker('b', 60, 20, 'cave:Goblin_Lair', 'Goblin lair')
        ]);
        expect(merged).toHaveLength(1);
        expect(merged[0]!.name).toBe('Goblin lair');
    });
});

describe('siteGroup', () => {
    it('groups the buildings of a city and nothing else', () => {
        expect(siteGroup('Monuments.Encounter.City_Ruins.Gatehouse.*')).toBe('city-ruins');
        expect(siteGroup('Monuments.Encounter.City_Oceans.Buildings_Tower.*')).toBe('city-oceans');
        expect(siteGroup('Monuments.Encounter.Zone4.Tier4.Village.Forest.Layout.*')).toBeUndefined();
    });
});
