import { defineConfig } from 'vitest/config';
import { aliases } from './aliases.ts';

export default defineConfig({
    resolve: { alias: aliases },
    test: { environment: 'node', include: ['packages/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.ts'] }
});
