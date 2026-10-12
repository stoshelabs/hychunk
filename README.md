# HyChunk

An open source map for Hytale worlds. Open a server save or type a seed and explore the world in your browser: terrain,
structures, dungeons, portals, mob spawn areas and players. Chunks the save never visited are predicted from the
world seed, so the whole island is on the map.

Everything runs client side. Save files are read in place and nothing is uploaded.

## Features

- Reads real saves: region files, chunks, blocks, fluids, markers, players and plugin worlds
- Draws the terrain the way the game's own map does: relief shading, biome tint, water and plants
- Predicts unexplored chunks from the seed, including trees, rocks, monuments, camps and the spawn room
- Place finder with search, category filters, a done list and CSV export
- Mob spawn areas and biome highlighting
- Shareable seed links: `?seed=<seed>&gv=<game version>`
- Player faces from the save's player files
- Game data versioned per Hytale release, selectable in the header
- English by default, with Portuguese at `/pt-br/`; each language is its own indexable page
- Fast on large worlds: worker pool, WebAssembly zstd, a three pass overview and a persistent browser cache

## Run it

Requires Node 24 and pnpm 10.

```sh
pnpm install
pnpm dev
```

Open the printed address, then pick a save folder (`universe/worlds/<name>`, or the whole server folder) or enter a seed.

To open a world directly in development:

```sh
HYCHUNK_WORLD=/path/to/universe/worlds/default pnpm dev   # then open /?world
```

## Translations

The site is written in English and the English text is the translation key. A language is a JSON file in
`apps/site/src/locales/` plus an entry in `apps/site/src/lib/i18n.ts` and in the `LOCALES` list of
`apps/site/vite.config.ts`, which also writes that language's page, sitemap entry and `hreflang` links at build time.
Set `VITE_SITE_URL` (see `apps/site/.env`) to the address the site is served from.

## Packages

| Package | Purpose |
| --- | --- |
| `@hychunk/core` | Region and chunk reading, block colours, markers, worker pool, structure placement |
| `@hychunk/map` | The 2D canvas map: pan, zoom, grids, markers, overlays |
| `@hychunk/worldgen` | World generator port used to predict unexplored chunks |
| `apps/site` | The web app (Vue 3 and Vitral) |

## Using the libraries

```ts
import { loadWorldFromFiles } from '@hychunk/core';
import { WorldMap } from '@hychunk/map';

const world = await loadWorldFromFiles([...input.files]); // <input type="file" webkitdirectory>
const map = new WorldMap(canvas, world);
map.on('hover', (p) => console.log(p.x, p.z));
map.goTo(world.config.spawn!.x, world.config.spawn!.z, 2);
```

## Game data

Predicted terrain needs data from the game. The site loads one pack per game version from
`apps/site/public/gamedata/<version>/` (generator files, prefab extents, spawn tables and block colours, gzipped).
`index.json` lists the available versions. A pack is built from a game install with
`packages/worldgen/src/gameData.build.spec.ts`; the instructions are at the top of that file.

These files derive from Hytale's own data, which belongs to Hypixel Studios.

## Development

```sh
pnpm test        # unit tests
pnpm typecheck   # tsc and vue-tsc
pnpm build       # build the packages
```

Tests that need a real save or the game files are skipped unless their environment variables are set. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/FORMAT.md](docs/FORMAT.md).

## License

LGPL-3.0-or-later. You can use HyChunk in a closed source application; changes to HyChunk itself stay under the same
license. Credit is required: keep [NOTICE](NOTICE). See [LICENSE](LICENSE) and [LICENSE.GPL](LICENSE.GPL).

HyChunk is an independent community project. It is not affiliated with or endorsed by Hypixel Studios.
