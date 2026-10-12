import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { aliases } from '../../aliases.ts';

// Development only: HYCHUNK_WORLD=/path/to/universe/worlds/default serves that world over HTTP
// (with Range) at /__world/, so the app can open it with `?world=` without picking a folder.
function devWorld(): Plugin {
    const root = process.env.HYCHUNK_WORLD;
    return {
        name: 'hychunk-dev-world',
        apply: 'serve',
        configureServer(server) {
            if (!root) return;
            server.middlewares.use('/__world', (req, res) => {
                const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
                const file = resolve(join(root, path));
                if (!file.startsWith(resolve(root)) || !existsSync(file) || !statSync(file).isFile()) {
                    if (path === '/index.json') {
                        res.setHeader('content-type', 'application/json');
                        res.end(JSON.stringify(readdirSync(join(root, 'chunks'))));
                        return;
                    }
                    res.statusCode = 404;
                    return void res.end();
                }
                const size = statSync(file).size;
                const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
                res.setHeader('accept-ranges', 'bytes');
                if (req.method === 'HEAD') {
                    res.setHeader('content-length', size);
                    return void res.end();
                }
                if (range) {
                    const start = Number(range[1]),
                        end = range[2] ? Number(range[2]) : size - 1;
                    res.statusCode = 206;
                    res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
                    res.setHeader('content-length', end - start + 1);
                    createReadStream(file, { start, end }).pipe(res);
                } else {
                    res.setHeader('content-length', size);
                    createReadStream(file).pipe(res);
                }
            });
        }
    };
}

/** Languages other than English, each served as a page of its own at `<base><lang>/` (see src/lib/i18n.ts). */
const LOCALES = [
    { id: 'pt-br', tag: 'pt-BR', og: 'pt_BR', catalog: new URL('./src/locales/pt-br.json', import.meta.url) }
];

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The built index.html in another language: its head and its crawlable text, from the language's catalog. */
function localize(html: string, siteUrl: string, locale: (typeof LOCALES)[number]): string {
    const catalog = JSON.parse(readFileSync(locale.catalog, 'utf8')) as Record<string, string>;
    const url = `${siteUrl}${locale.id}/`;
    let out = html
        .replace('<html lang="en">', `<html lang="${locale.tag}">`)
        .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
        .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
        .replace('content="en_US"', `content="${locale.og}"`)
        .replace(
            '<meta property="og:locale:alternate" content="pt_BR" />',
            '<meta property="og:locale:alternate" content="en_US" />'
        );
    const title = `HyChunk: ${catalog['Hytale world map']}`;
    out = out.replaceAll('HyChunk: Hytale world map', escapeHtml(title));
    // longest first, so a phrase is replaced before the shorter ones inside it
    for (const [english, translated] of Object.entries(catalog).sort((a, b) => b[0].length - a[0].length)) {
        if (english.length > 24)
            out = out.replaceAll(escapeHtml(english), escapeHtml(translated)).replaceAll(english, translated);
    }
    return out;
}

/** robots.txt, sitemap.xml, the web manifest and the other languages' pages, written at build time from the public address. */
function seoFiles(siteUrl: string, base: string): Plugin {
    const alternates = [
        `    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}"/>`,
        ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${siteUrl}${l.id}/"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}"/>`
    ].join('\n');
    const urls = [siteUrl, ...LOCALES.map((l) => `${siteUrl}${l.id}/`)];
    const files: Record<string, string> = {
        'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`,
        'sitemap.xml': [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
            ...urls.map(
                (loc) => `  <url>\n    <loc>${loc}</loc>\n${alternates}\n    <changefreq>weekly</changefreq>\n  </url>`
            ),
            '</urlset>',
            ''
        ].join('\n'),
        'manifest.webmanifest': JSON.stringify(
            {
                name: 'HyChunk',
                short_name: 'HyChunk',
                description: 'A map of Hytale worlds in your browser.',
                start_url: base,
                scope: base,
                display: 'standalone',
                background_color: '#0b0e14',
                theme_color: '#0b0e14',
                icons: [{ src: `${base}logo.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
            },
            null,
            2
        )
    };
    return {
        name: 'hychunk-seo',
        enforce: 'post',
        generateBundle(_, bundle) {
            for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: 'asset', fileName, source });
            const index = bundle['index.html'];
            if (index?.type !== 'asset') return;
            for (const locale of LOCALES) {
                this.emitFile({
                    type: 'asset',
                    fileName: `${locale.id}/index.html`,
                    source: localize(String(index.source), siteUrl, locale)
                });
            }
        }
    };
}

export default defineConfig(({ mode }) => {
    const base = process.env.SITE_BASE ?? '/';
    const siteUrl = (
        process.env.VITE_SITE_URL ??
        loadEnv(mode, import.meta.dirname, 'VITE_').VITE_SITE_URL ??
        '/'
    ).replace(/\/?$/, '/');
    return {
        base,
        plugins: [vue(), devWorld(), seoFiles(siteUrl, base)],
        resolve: { alias: aliases },
        define: { __DEV_WORLD__: JSON.stringify(!!process.env.HYCHUNK_WORLD) }
    };
});
