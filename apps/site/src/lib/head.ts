import { watchEffect } from 'vue';
import { lang, langs, languages, pathOf, t, type Lang } from './i18n';

/**
 * The title, description, social tags and structured data of the page, in the reader's language. The first language's
 * tags are written into index.html for crawlers (see vite.config.ts); this keeps them right when the language changes,
 * which is what a link shared from an open tab picks up.
 */
const NAME = 'HyChunk';
const ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/?$/, '/') ?? '/';
const absolute = (path = '') => new URL(path, new URL(ORIGIN, location.href)).href;

const pageUrl = (which: Lang) => new URL(pathOf(which).slice(import.meta.env.BASE_URL.length), absolute()).href;

function meta(attribute: 'name' | 'property', key: string, content: string) {
    let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, key);
        document.head.appendChild(tag);
    }
    tag.content = content;
}

function link(rel: string, href: string, extra: Record<string, string> = {}) {
    const selector = `link[rel="${rel}"]${Object.entries(extra)
        .map(([k, v]) => `[${k}="${v}"]`)
        .join('')}`;
    let tag = document.head.querySelector<HTMLLinkElement>(selector);
    if (!tag) {
        tag = document.createElement('link');
        tag.rel = rel;
        for (const [k, v] of Object.entries(extra)) tag.setAttribute(k, v);
        document.head.appendChild(tag);
    }
    tag.href = href;
}

function structuredData(description: string, url: string) {
    return {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebApplication',
                '@id': `${absolute()}#app`,
                name: NAME,
                url: absolute(),
                description,
                applicationCategory: 'GameApplication',
                operatingSystem: 'Any',
                browserRequirements: 'Requires JavaScript, WebAssembly and Web Workers',
                inLanguage: langs.map((l) => languages[l].tag),
                license: 'https://www.gnu.org/licenses/lgpl-3.0.html',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                image: absolute('og.png')
            },
            {
                '@type': 'WebSite',
                '@id': `${absolute()}#website`,
                name: NAME,
                url: absolute(),
                inLanguage: languages[lang.value].tag
            },
            {
                '@type': 'WebPage',
                '@id': url,
                url,
                name: `${NAME}: ${t('Hytale world map')}`,
                description,
                isPartOf: { '@id': `${absolute()}#website` }
            }
        ]
    };
}

export function useDocumentHead() {
    watchEffect(() => {
        const title = `${NAME}: ${t('Hytale world map')}`;
        const description = t(
            'Explore Hytale worlds in your browser. Open a server save or enter a seed to see terrain, structures, dungeons and mob spawn areas, with unexplored chunks predicted from the seed.'
        );
        const url = pageUrl(lang.value);

        document.title = title;
        meta('name', 'description', description);
        meta('property', 'og:title', title);
        meta('property', 'og:description', description);
        meta('property', 'og:url', url);
        meta('property', 'og:locale', languages[lang.value].og);
        meta('name', 'twitter:title', title);
        meta('name', 'twitter:description', description);
        link('canonical', url);

        document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((tag) => tag.remove());
        for (const [hreflang, href] of [
            ...langs.map((l) => [languages[l].tag, pageUrl(l)] as const),
            ['x-default', pageUrl('en')] as const
        ]) {
            link('alternate', href, { hreflang });
        }

        let script = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
        if (!script) {
            script = document.createElement('script');
            script.type = 'application/ld+json';
            document.head.appendChild(script);
        }
        script.textContent = JSON.stringify(structuredData(description, url));
    });
}
