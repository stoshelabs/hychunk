# @hychunk/worldgen

A TypeScript port of Hytale's default world generator, used to predict terrain in chunks nobody has explored yet.
It reads the generator's data files from Hytale itself. The site ships them as one pack per game version (see `apps/site/public/gamedata`); `src/gameData.build.spec.ts` builds a pack from a game install.

```ts
import { loadWorldGen, memorySource } from '@hychunk/worldgen';

const worldGen = loadWorldGen(memorySource(files)); // files: the generator's JSON, keyed by path
const gen = worldGen.forSeed(123456);
const height = gen.heightAt(0, 0);
```

`@hychunk/core` builds on it to draw predicted chunks.
