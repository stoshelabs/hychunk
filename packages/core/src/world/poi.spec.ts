import { describe, expect, it } from 'vitest';
import {
    PoiGenerator,
    caveLabel,
    DUNGEON_CAVES,
    portalLabel,
    siteCategory,
    siteLabel,
    type StructureSource
} from './poi';

const source = (over: Partial<StructureSource> = {}): StructureSource => ({
    unique: async () => [
        { name: 'Spawn', zone: 'Zone1_Spawn', x: -85, y: 113, z: 179, isSpawn: true },
        { name: 'Temple', zone: 'Zone1_Temple', x: -287, y: 119, z: 31, isSpawn: false }
    ],
    square: async (x, z) =>
        x === 0 && z === 0
            ? [
                  {
                      x: 40,
                      y: 70,
                      z: 50,
                      name: 'Monuments.Challenge.Grass.Combat.C1',
                      key: 'Monuments.Challenge.Grass.*',
                      biome: 'Plains'
                  }
              ]
            : [],
    dispose: () => {},
    ...over
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('PoiGenerator', () => {
    it('has nothing without a generator', () => {
        expect(new PoiGenerator(1).getMarkersInRect(-1e6, -1e6, 1e6, 1e6)).toEqual([]);
    });

    it('lists the unique structures once the source answers', async () => {
        let updates = 0;
        const gen = new PoiGenerator(1, source(), () => {
            updates++;
        });
        expect(gen.getMarkersInRect(-1000, -1000, 1000, 1000)).toEqual([]);
        await settle();
        expect(updates).toBeGreaterThan(0);
        const all = gen.getMarkersInRect(-1000, -1000, 1000, 1000);
        expect(all.map((m) => [m.name, m.x, m.z])).toEqual(
            expect.arrayContaining([
                ['Spawn room', -85, 179],
                ['Temple', -287, 31]
            ])
        );
        expect(gen.getMarkersInRect(0, 0, 1000, 1000).some((m) => m.name === 'Temple')).toBe(false);
    });

    it('fills squares in later and names them by what they are', async () => {
        const gen = new PoiGenerator(1, source());
        gen.getMarkersInRect(0, 0, 511, 511);
        await settle();
        const m = gen.getMarkersInRect(0, 0, 511, 511).find((x) => x.category);
        expect(m).toMatchObject({ name: 'Combat challenge · Grasslands', category: 'challenges', x: 40, z: 50 });
    });

    it('works nearest the view first and does not ask twice', async () => {
        const asked: string[] = [];
        const gen = new PoiGenerator(
            1,
            source({
                square: async (x, z) => {
                    asked.push(`${x},${z}`);
                    return [];
                }
            })
        );
        gen.getMarkersInRect(-512, -512, 1023, 511); // squares -1..1 across, -1..0 down: centre near (256, 0)
        await settle();
        await settle();
        gen.getMarkersInRect(-512, -512, 1023, 511);
        await settle();
        expect(asked.length).toBe(new Set(asked).size);
        expect(asked.length).toBe(6);
        expect(asked[0]).toBe('0,-512'); // the square whose middle is nearest the middle of the view
    });

    it('asks several squares at once when it may', async () => {
        let active = 0,
            peak = 0;
        const slow = source({
            square: async () => {
                active++;
                peak = Math.max(peak, active);
                await new Promise((r) => setTimeout(r, 10));
                active--;
                return [];
            }
        });
        const gen = new PoiGenerator(1, slow, undefined, 3);
        gen.getMarkersInRect(0, 0, 2047, 511);
        await new Promise((r) => setTimeout(r, 120));
        expect(peak).toBe(3);
        expect(gen.getMarkersInRect(0, 0, 2047, 511).filter((m) => m.category)).toEqual([]);
    });

    it('survives a source that fails', async () => {
        const gen = new PoiGenerator(
            1,
            source({
                unique: async () => {
                    throw new Error('no files');
                },
                square: async () => {
                    throw new Error('boom');
                }
            })
        );
        gen.getMarkersInRect(0, 0, 511, 511);
        await settle();
        expect(gen.getMarkersInRect(0, 0, 511, 511)).toEqual([]);
    });
});

describe('cave dungeons', () => {
    it('marks where a dungeon-like cave begins, as a dungeon', async () => {
        const gen = new PoiGenerator(
            1,
            source({
                caves: async (x, z) =>
                    x === 0 && z === 0
                        ? [
                              {
                                  type: 'Grasslands_Mountain_Goblin_Lair',
                                  entry: 'Mountain_GoblinLair.Entry',
                                  zone: 'Zone1_Tier1',
                                  x: 200,
                                  y: 150,
                                  z: 300
                              }
                          ]
                        : []
            })
        );
        gen.getMarkersInRect(0, 0, 511, 511);
        await settle();
        const m = gen.getMarkersInRect(0, 0, 511, 511).find((x) => x.id.startsWith('cave-'));
        expect(m).toMatchObject({
            name: 'Goblin lair · Grasslands Mountain',
            category: 'dungeons',
            x: 200,
            y: 150,
            z: 300
        });
    });

    it('leaves out ore veins and plain caves', () => {
        for (const n of [
            'Dungeons_Cave',
            'Grasslands_Mountain_Goblin_Lair',
            'Firelands_Sewer',
            'Scarak_Hives',
            'Outlander_Temple_Visible'
        ])
            expect(DUNGEON_CAVES.test(n)).toBe(true);
        for (const n of ['Copper', 'Iron', 'Grasslands_Deep', 'Treasure']) expect(DUNGEON_CAVES.test(n)).toBe(false);
        expect(caveLabel('Drylands_Dungeons')).toBe('Dungeon · Drylands');
    });
});

describe('portals', () => {
    it('a structure with a door to another world is shown by the door', async () => {
        const gen = new PoiGenerator(1, {
            unique: async () => [],
            square: async (x, z) =>
                x === 0 && z === 0
                    ? [
                          {
                              x: 100,
                              y: 110,
                              z: 100,
                              name: 'Monuments.Unique.Temple.Portal.Drylands.X',
                              key: 'Monuments.Unique.Temple.Portal.Drylands.*',
                              biome: 'Savannah',
                              marks: [{ block: 'Forgotten_Temple_Portal_Enter', x: 82, y: 103, z: 103 }]
                          }
                      ]
                    : [],
            dispose: () => {}
        });
        gen.getMarkersInRect(0, 0, 511, 511);
        await settle();
        const all = gen.getMarkersInRect(0, 0, 511, 511);
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ name: 'Forgotten Temple portal', category: 'portals', x: 82, y: 103, z: 103 });
    });

    it('reads the instance from the block name', () => {
        expect(portalLabel('Forgotten_Temple_Portal_Enter')).toBe('Forgotten Temple portal');
        expect(portalLabel('Portal_Device')).toBe('Portal');
    });
});

describe('structure names', () => {
    it('sorts keys into filters and reads them', () => {
        expect(siteCategory('Monuments.Challenge.Sand.*')).toBe('challenges');
        expect(siteCategory('Monuments.Encounter.Zone1.Tier1.Outpost.*')).toBe('encounters');
        expect(siteCategory('Monuments.Unique.Temple.Portal.Grasslands.*')).toBe('temples');
        expect(siteCategory('Monuments.Incidental.Slate.*')).toBe('prefabs');
        expect(siteCategory('Npc.Outlander.Camps.Tier1.*')).toBe('camps');
        expect(siteLabel('Npc.Outlander.Camps.Tier1.*')).toBe('Outlander Camps Tier1');
        expect(siteLabel('Monuments.Incidental.Quartzite.Ruins.*')).toBe('Incidental Quartzite Ruins');
    });
});
