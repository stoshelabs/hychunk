// One library build for every package: ES modules with the source tree kept
// file for file, so a bundler can drop whatever an app does not import.
import { resolve } from 'node:path';
import { defineConfig, type UserConfig } from 'vite';

const externalPackages = ['fzstd', 'zstddec', 'three'];

const external = (id: string) =>
    id.startsWith('node:') ||
    id.startsWith('@hychunk/') ||
    externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

export function libConfig(dir: string, options: { entries?: string[] } = {}): UserConfig {
    const entries = ['index', ...(options.entries ?? [])];
    return defineConfig({
        build: {
            target: ['es2021', 'safari15', 'chrome91', 'firefox90', 'edge91'],
            lib: {
                entry: Object.fromEntries(entries.map((name) => [name, resolve(dir, `src/${name}.ts`)])),
                formats: ['es']
            },
            outDir: resolve(dir, 'dist'),
            emptyOutDir: true,
            sourcemap: true,
            minify: false,
            rollupOptions: {
                external,
                output: { preserveModules: true, preserveModulesRoot: resolve(dir, 'src'), entryFileNames: '[name].js' }
            }
        }
    });
}
