import { describe, expect, it } from 'vitest';
import { listWorlds, loadWorldFromFiles } from './source';

const file = (path: string, content = '{}') => {
    const f = new File([content], path.split('/').pop()!);
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
};
const region = (dir: string) => file(`${dir}/chunks/0.0.region.bin`, 'x');

describe('loadWorldFromFiles', () => {
    it("does not take a picked server folder's own config.json for a world", async () => {
        const world = await loadWorldFromFiles([
            file('server/config.json', '{"ServerName":"x"}'),
            file('server/mods/Plots/config.json'),
            file('server/universe/worlds/city/config.json', '{"Seed":3}'),
            region('server/universe/worlds/city')
        ]);
        expect(world.name).toBe('city');
        expect(world.config.seed).toBe(3);
    });
    it('opens a picked world folder directly', async () => {
        const world = await loadWorldFromFiles([file('city/config.json', '{"Seed":9}'), region('city')]);
        expect(world.name).toBe('city');
    });
    it('says why a world is empty', async () => {
        await expect(
            loadWorldFromFiles([file('w/config.json', '{"ChunkStorage":{"Type":"Other"}}'), file('w/chunks/a.txt')])
        ).rejects.toThrow(/"Other"/);
        await expect(loadWorldFromFiles([file('server/config.json')])).rejects.toThrow(/No world found/);
    });

    it("lists the server's worlds and the ones plugins keep in their own folders, told apart by path", async () => {
        const files = [
            file('server/config.json'),
            file('server/universe/worlds/default/config.json'),
            file('server/universe/worlds/default/chunks/0.0.region.bin', 'x'),
            file('server/universe/worlds/plotworld/config.json'),
            file('server/universe/worlds/plotworld/chunks/0.0.region.bin', 'x'),
            file('server/mods/Stoshe_AeroWars/worlds/void/config.json', '{"Seed":1}'),
            file('server/mods/Stoshe_AeroWars/worlds/void/chunks/0.0.region.bin', 'x'),
            file('server/mods/Stoshe_AeroWars/worlds/void/chunks/1.0.region.bin', 'x'),
            file('server/mods/Other/worlds/void/config.json', '{"Seed":2}'),
            file('server/mods/Other/worlds/void/chunks/0.0.region.bin', 'x'),
            file('server/mods/Stoshe_Plots/config.json')
        ];
        const worlds = listWorlds(files);
        expect(worlds.map((w) => `${w.source}:${w.name}:${w.regions}`)).toEqual([
            'universe:default:1',
            'universe:plotworld:1',
            'Other:void:1',
            'Stoshe_AeroWars:void:2'
        ]);
        const aero = await loadWorldFromFiles(files, 'server/mods/Stoshe_AeroWars/worlds/void/');
        expect(aero.config.seed).toBe(1);
        expect(aero.regions).toHaveLength(2);
        expect((await loadWorldFromFiles(files, 'server/mods/Other/worlds/void/')).config.seed).toBe(2);
        expect((await loadWorldFromFiles(files)).name).toBe('default');
    });

    it('opens where the most recent player was in that world, else at the spawn', async () => {
        const player = (name: string, world: string, x: number, at: number) => {
            const f = file(
                `server/universe/players/${name}.json`,
                JSON.stringify({
                    Components: {
                        Nameplate: { Text: name },
                        Transform: { Position: { X: x, Y: 70, Z: 5 } },
                        Player: {
                            PlayerData: {
                                World: world,
                                PerWorldData: { city: { LastPosition: { X: x + 1000, Y: 70, Z: 5 } } }
                            }
                        }
                    }
                })
            );
            Object.defineProperty(f, 'lastModified', { value: at });
            return f;
        };
        const base = [
            file('server/universe/worlds/city/config.json', '{"SpawnProvider":{"SpawnPoint":{"X":7,"Y":1,"Z":8}}}'),
            region('server/universe/worlds/city')
        ];
        const w = await loadWorldFromFiles([
            ...base,
            player('ana', 'city', 10, 100),
            player('bob', 'elsewhere', 20, 300),
            player('cy', 'city', 30, 200)
        ]);
        expect(w.players.map((p) => `${p.name}:${p.x}`)).toEqual(['bob:1020', 'cy:30', 'ana:10']);
        expect(w.start).toEqual({ x: 1020, z: 5, label: 'bob' });
        const none = await loadWorldFromFiles(base);
        expect(none.start).toEqual({ x: 7, z: 8, label: 'Spawn' });
    });
});
