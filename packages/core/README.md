# @hychunk/core

Reads Hytale world saves: `*.region.bin` files, chunk BSON and `config.json`. No framework; it runs in Node, in the
browser and in workers.

```ts
import { loadWorldFromFiles } from '@hychunk/core';

const world = await loadWorldFromFiles([...input.files]);
```

- The default entry point is browser-safe: region files, chunks, block colours, markers, predicted surfaces and the
  worker pool.
- `@hychunk/core/node` adds helpers that need Node, such as `fromPath`.

The save format is described in [docs/FORMAT.md](../../docs/FORMAT.md).
