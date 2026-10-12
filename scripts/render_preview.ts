// Renders the predicted terrain around the origin to a PNG, to check the generator by eye.
//
// Usage: HYCHUNK_ASSETS=/path/to/Assets.zip node scripts/render_preview.ts <out.png> [seed] [chunkRadius]
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { WorldConfig } from '../packages/core/src/index.ts';
import { generatePredictedSurface } from '../packages/core/src/world/predict.ts';
import { renderChunkPixels } from '../packages/core/src/world/render.ts';
import { loadWorldGen, memorySource } from '../packages/worldgen/src/index.ts';
import { loadWorldGenFiles } from './worldgenFiles.ts';

const CHUNK = 32;

const [outPath, seedArg = '123456', radiusArg = '16'] = process.argv.slice(2);
if (!outPath) {
    console.error('usage: render_preview.ts <out.png> [seed] [chunkRadius]');
    process.exit(1);
}

const seed = Number(seedArg);
const radius = Number(radiusArg);
const size = radius * 2 * CHUNK;
const config: WorldConfig = {
    seed,
    spawn: null,
    worldGen: 'Default',
    worldGenType: 'Hytale',
    requiredPlugins: [],
    chunkStorage: 'Hytale'
};

const gen = loadWorldGen(memorySource(await loadWorldGenFiles())).forSeed(seed);
const png = new PNG({ width: size, height: size });
const pixels = new Uint8ClampedArray(CHUNK * CHUNK * 4);

for (let cz = -radius; cz < radius; cz++) {
    for (let cx = -radius; cx < radius; cx++) {
        renderChunkPixels(generatePredictedSurface(cx, cz, config, gen), pixels);
        for (let z = 0; z < CHUNK; z++) {
            const row = ((cz + radius) * CHUNK + z) * size + (cx + radius) * CHUNK;
            png.data.set(pixels.subarray(z * CHUNK * 4, (z + 1) * CHUNK * 4), row * 4);
        }
    }
}

writeFileSync(outPath, PNG.sync.write(png));
console.log(`Saved a ${size}x${size} preview to ${outPath}`);
