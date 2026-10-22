import { ref, shallowRef, watch } from 'vue';
import type { MapMarker } from '@hychunk/core';
import { loadLang } from '../gameData';
import { lang, t } from '../lib/i18n';
import { useGameData } from './useGameData';

/** The game's own language for each of the site's: labels read as they do in the game. */
const LOCALES: Record<string, string> = { en: 'en-US', 'pt-br': 'pt-BR' };

const texts = shallowRef<Record<string, string> | null>(null);
/** Changes when the texts do, so what depends on them is worked out again. */
const revision = ref(0);
let started = false;

const game = useGameData();

async function load() {
    const id = game.versionId.value;
    if (!id) return;
    const locale = LOCALES[lang.value] ?? 'en-US';
    const found = await loadLang(id, locale);
    // a game version without that language reads in English
    texts.value = found ?? (locale === 'en-US' ? null : await loadLang(id, 'en-US'));
    revision.value++;
}

/** A text of the game (`map.region.Zone1_Tier1`, `items.Portal_Return.name`), or `fallback` when the game has none in this language. */
export const gameText = (key: string, fallback: string) => texts.value?.[key] ?? fallback;

/** A piece of a generated name ("Outpost", "Zone 1", "Trork watchtower (tier 3)") in the site's language. */
function piece(text: string): string {
    const tier = /^(.*?) \(tier (\d)\)$/.exec(text);
    if (tier) return `${piece(tier[1]!)} (${t('tier {n}', { n: tier[2]! })})`;
    const zone = /^Zone (\d)$/.exec(text);
    if (zone) return t('Zone {n}', { n: zone[1]! });
    return t(text);
}

/** Our generated names ("Outpost · Zone 1 (tier 1)", "Goblin lair · Zone 1, Grasslands Mountain") in the site's language. */
export const translateName = (name: string) =>
    name
        .split(' · ')
        .map((part) => part.split(', ').map(piece).join(', '))
        .join(' · ');

/** What a marker is called: the game's name for its portal block, else our own name in the site's language. */
export function markerName(m: MapMarker): string {
    const known = m.block ? texts.value?.[`items.${m.block}.name`] : undefined;
    return known ?? translateName(m.name);
}

export function useGameText() {
    if (!started) {
        started = true;
        watch([game.versionId, lang], load, { immediate: true });
    }
    return { revision, gameText, markerName };
}
