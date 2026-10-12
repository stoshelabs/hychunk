# Contributing

HyChunk is LGPL-3.0-or-later; by contributing you agree your change is released under it. Keep the
[NOTICE](NOTICE).

## Setup

You need Node 24 and pnpm 10 (the exact pnpm version is pinned in `package.json`).

```sh
pnpm install
pnpm dev        # the site, with hot reload
```

## Layout

| Package | Holds | Framework |
| --- | --- | --- |
| `@hychunk/core` | Region files, chunk BSON, blocks, colours, markers, predicted surfaces | none |
| `@hychunk/map` | The 2D canvas map | none |
| `@hychunk/worldgen` | The port of Hytale's world generator | none |
| `apps/site` | The GitHub Pages site | Vue |

Packages other than the site never import `vue`. `core` and `worldgen` also avoid `three` and the DOM, so they run
in Node and in a worker. Framework wrappers sit on top of them.

## Checks

```sh
pnpm typecheck && pnpm test && pnpm build
```

CI runs the same steps, plus a build of the site.

## Style

4-space indentation, single quotes, semicolons, no trailing commas, lines of about 120 characters (see
`.prettierrc.json` and `.editorconfig`). Comments explain why, not what. Everything is written in English.

## Game data and saves

Format findings go in [docs/FORMAT.md](docs/FORMAT.md); say how you verified them. Tests that need a real save or
the game's `Assets.zip` read `HYCHUNK_SAMPLE` and `HYCHUNK_ASSETS` and are skipped when those are unset. Never
commit save files or game assets.
