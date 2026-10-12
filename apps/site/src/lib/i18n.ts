import { ref } from 'vue';
import ptBr from '../locales/pt-br.json';

/**
 * English is the language the site is written in: the English text is the translation key, so `t('Search')` reads
 * `"Search": "Buscar"` in `locales/pt-br.json`. Anything a language has not translated is shown in English.
 *
 * The language is part of the address (`/` is English, `/pt-br/` is Portuguese), so every language is a page of its own
 * that a search engine can index. To add one: its JSON file, an entry in `languages` and in `catalogs` below.
 */
export type Lang = 'en' | 'pt-br';

export const languages: Record<Lang, { tag: string; og: string; name: string; short: string }> = {
    en: { tag: 'en', og: 'en_US', name: 'English', short: 'EN' },
    'pt-br': { tag: 'pt-BR', og: 'pt_BR', name: 'Português (Brasil)', short: 'PT' }
};

export const langs = Object.keys(languages) as Lang[];

const catalogs: Partial<Record<Lang, Record<string, string>>> = { 'pt-br': ptBr };

const BASE = import.meta.env.BASE_URL;

/** The address of a language's page, under the base the site is served from. */
export const pathOf = (which: Lang) => (which === 'en' ? BASE : `${BASE}${which}/`);

function langOfPath(): Lang {
    const first = location.pathname.slice(BASE.length).split('/')[0]?.toLowerCase();
    return langs.find((l) => l !== 'en' && l === first) ?? 'en';
}

export const lang = ref<Lang>(langOfPath());

/** Switches language and moves the address to its page, keeping the seed and the view. */
export function setLang(next: Lang) {
    if (next === lang.value) return;
    lang.value = next;
    document.documentElement.lang = languages[next].tag;
    history.replaceState(null, '', `${pathOf(next)}${location.search}${location.hash}`);
}

/** `{name}` placeholders in a string, filled in. */
const fill = (text: string, params?: Record<string, string | number>) =>
    params ? text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? String(params[key]) : whole)) : text;

export function t(english: string, params?: Record<string, string | number>): string {
    return fill(catalogs[lang.value]?.[english] ?? english, params);
}

/** `one` or `other` by the count, each with `{n}` available. */
export const tn = (n: number, one: string, other: string) => t(n === 1 ? one : other, { n });

document.documentElement.lang = languages[lang.value].tag;
