import { computed, ref, watch } from 'vue';
import { useGameData } from './useGameData';
import { useSession } from './useSession';

const MAX_SUGGESTIONS = 80;
const readable = (id: string) => id.replace(/_/g, ' ');

const game = useGameData();
const session = useSession();

const mobQuery = ref('');
const mobShown = ref('');
const biomeQuery = ref('');
const biomeShown = ref('');
const mobSuggestions = ref<string[]>([]);
const biomeSuggestions = ref<string[]>([]);

const mobIds = computed(() => game.spawns.value?.mobs() ?? []);
const biomes = computed(() => {
    const gen = game.worldGen();
    if (!gen) return [];
    const out: { key: string; label: string }[] = [];
    for (const zone of gen.zones) {
        for (const biome of [...zone.tiles, ...zone.customs]) {
            out.push({ key: `${zone.name}/${biome.name}`, label: `${readable(biome.name)} (${readable(zone.name)})` });
        }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
});

/** Names that start with the text first, then those that only contain it. */
function suggest(all: string[], query: string) {
    const q = query.trim().toLowerCase();
    const starts = all.filter((x) => x.toLowerCase().startsWith(q));
    const contains = all.filter((x) => !x.toLowerCase().startsWith(q) && x.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

// Another game version has other mobs and biomes: what was picked may not exist there.
watch(game.data, () => {
    if (mobShown.value && !mobIds.value.includes(mobShown.value)) clearMob();
    else if (mobShown.value) session.map.value?.setSpawnArea(game.spawns.value?.envsOf(mobShown.value) ?? null);
    if (biomeShown.value && !biomes.value.some((b) => b.label === biomeShown.value)) clearBiome();
});

function showMob(picked?: unknown) {
    if (typeof picked === 'string') mobQuery.value = picked;
    const wanted = mobQuery.value.trim().toLowerCase();
    const id = mobIds.value.find((m) => m.toLowerCase() === wanted || readable(m).toLowerCase() === wanted);
    if (!id || !game.spawns.value) return;
    mobShown.value = id;
    clearBiome();
    session.map.value?.setSpawnArea(game.spawns.value.envsOf(id));
}

function clearMob() {
    mobShown.value = '';
    mobQuery.value = '';
    session.map.value?.setSpawnArea(null);
}

function showBiome(picked?: unknown) {
    if (typeof picked === 'string') biomeQuery.value = picked;
    const wanted = biomeQuery.value.trim().toLowerCase();
    const hit = biomes.value.find((b) => b.label.toLowerCase() === wanted);
    if (!hit) return;
    biomeShown.value = hit.label;
    clearMob();
    session.map.value?.setHighlight({ biomes: [hit.key] });
}

function clearBiome() {
    biomeShown.value = '';
    biomeQuery.value = '';
    session.map.value?.setHighlight(null);
}

/** The mobs that spawn in an environment, most likely first. */
export function mobsIn(environment: string): string[] {
    if (!game.spawns.value || !environment) return [];
    const best = new Map<string, number>();
    for (const m of game.spawns.value.mobsIn(environment)) best.set(m.id, Math.max(best.get(m.id) ?? 0, m.share));
    return [...best]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([id]) => readable(id));
}

export function useSpawnTools() {
    return {
        mobQuery,
        mobShown,
        mobSuggestions,
        biomeQuery,
        biomeShown,
        biomeSuggestions,
        completeMob: (e: { query: string }) => (mobSuggestions.value = suggest(mobIds.value.map(readable), e.query)),
        completeBiome: (e: { query: string }) =>
            (biomeSuggestions.value = suggest(
                biomes.value.map((b) => b.label),
                e.query
            )),
        showMob,
        clearMob,
        showBiome,
        clearBiome
    };
}
