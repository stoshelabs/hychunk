# @hychunk/map

A pannable, zoomable 2D canvas map of a Hytale world. No framework; give it a
`<canvas>` and a world from `@hychunk/core`.

```ts
import { loadWorldFromFiles } from '@hychunk/core';
import { WorldMap } from '@hychunk/map';

const world = await loadWorldFromFiles([...input.files]);
const map = new WorldMap(canvas, world);
map.on('hover', (p) => p && console.log(p.x, p.z, p.chunkX, p.chunkZ));
```
