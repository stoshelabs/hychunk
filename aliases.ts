import { resolve } from 'node:path';

export const aliases = {
    '@hychunk/core': resolve(import.meta.dirname, 'packages/core/src/index.ts'),
    '@hychunk/map': resolve(import.meta.dirname, 'packages/map/src/index.ts'),
    '@hychunk/worldgen': resolve(import.meta.dirname, 'packages/worldgen/src/index.ts'),
    '@hychunk/view3d/worker': resolve(import.meta.dirname, 'packages/view3d/src/worker.ts'),
    '@hychunk/view3d': resolve(import.meta.dirname, 'packages/view3d/src/index.ts')
};
