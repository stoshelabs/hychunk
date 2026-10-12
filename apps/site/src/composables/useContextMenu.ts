import { ref } from 'vue';
import { seed32 } from '../lib/seed';
import { t } from '../lib/i18n';
import { useGameData } from './useGameData';
import { mobsIn } from './useSpawnTools';
import { useSession } from './useSession';

export interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    block: { x: number; y: number; z: number };
    chunk: { x: number; z: number };
    region: { x: number; z: number };
    biome: string;
    zone: string;
    distance: number;
    mobs: string[];
}

const MENU_WIDTH = 240;
const MENU_HEIGHT = 290;
const EDGE = 8;
const DEFAULT_HEIGHT = 100;
const CHUNK = 32;
const REGION = 32;

const game = useGameData();
const session = useSession();

const state = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    block: { x: 0, y: DEFAULT_HEIGHT, z: 0 },
    chunk: { x: 0, z: 0 },
    region: { x: 0, z: 0 },
    biome: '',
    zone: '',
    distance: 0,
    mobs: []
});

const close = () => (state.value.visible = false);

function open(e: MouseEvent, canvas: HTMLCanvasElement) {
    const map = session.map.value;
    if (!map) return;
    const rect = canvas.getBoundingClientRect();
    const at = map.toBlock(e.clientX - rect.left, e.clientY - rect.top);
    const x = Math.round(at.x);
    const z = Math.round(at.z);
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);

    let biome = t('Unknown');
    let zone = '';
    let y = DEFAULT_HEIGHT;
    let mobs: string[] = [];
    const gen = game.worldGen();
    const seed = session.world.value?.config.seed;
    if (gen && seed !== undefined) {
        try {
            const terrain = gen.forSeed(seed32(seed));
            const column = terrain.zoneBiomeAt(x, z);
            biome = column.biome?.name.replace(/_/g, ' ') ?? biome;
            zone = column.zone?.name.replace(/_/g, ' ') ?? '';
            y = Math.round(terrain.heightAt(x, z));
            mobs = mobsIn(terrain.environmentAt(x, z));
        } catch {
            // outside what the generator can place: the menu still offers coordinates
        }
    }

    const spawn = session.world.value?.config.spawn;
    state.value = {
        visible: true,
        x: e.clientX + MENU_WIDTH > window.innerWidth - EDGE ? Math.max(EDGE, e.clientX - MENU_WIDTH) : e.clientX,
        y: e.clientY + MENU_HEIGHT > window.innerHeight - EDGE ? Math.max(EDGE, e.clientY - MENU_HEIGHT) : e.clientY,
        block: { x, y, z },
        chunk: { x: cx, z: cz },
        region: { x: Math.floor(cx / REGION), z: Math.floor(cz / REGION) },
        biome,
        zone,
        distance: spawn ? Math.round(Math.hypot(x - spawn.x, z - spawn.z)) : 0,
        mobs
    };
}

export function useContextMenu() {
    return { state, open, close };
}
