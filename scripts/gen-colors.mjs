#!/usr/bin/env node
// Builds packages/core/src/data/blockColors.ts from a Hytale Assets.zip: for each
// block id a colour, a shape and, where they differ from the top, side and bottom
// colours — all numbers. No texture or definition is copied.
//
// A block's colour is the average of its top texture, multiplied by its tint when
// it has one (grass and leaves ship as grayscale and are tinted in game).
// Definitions are read from Server/Item/Items, following `Parent` for what a
// child leaves out.
//
// Shapes: 1 cube (the default, so cubes are not listed), 0 not drawn (decoration,
// roots, torches...), 2 leaves, 3 cross-shaped plant, 4 half block.
//
// Usage: node scripts/gen-colors.mjs /path/to/Assets.zip

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const zipPath = process.argv[2];
if (!zipPath) { console.error('usage: gen-colors.mjs <Assets.zip>'); process.exit(1); }

// The archive is several GB, so only what is needed is pulled out, with the system `unzip`.
const tmp = mkdtempSync(join(tmpdir(), 'hychunk-'));
execFileSync('unzip', ['-q', '-o', zipPath, 'Server/Item/Items/*.json', 'Server/Item/Block/Fluids/*.json', 'Common/BlockTextures/*.png', 'Common/Blocks/*.png', '-d', tmp]);

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const defs = new Map();
for (const file of walk(join(tmp, 'Server/Item/Items')).filter((f) => f.endsWith('.json'))) {
    try { defs.set(file.slice(file.lastIndexOf('/') + 1, -5), JSON.parse(readFileSync(file, 'utf8'))); } catch { /* a definition that is not plain JSON is skipped */ }
}

// Fluids are flat files (no BlockType wrapper) with a `Textures` list of their own.
const fluids = new Map();
for (const file of walk(join(tmp, 'Server/Item/Block/Fluids')).filter((f) => f.endsWith('.json'))) {
    fluids.set(file.slice(file.lastIndexOf('/') + 1, -5), JSON.parse(readFileSync(file, 'utf8')));
}
const fluidDef = (id, depth = 0) => {
    const d = fluids.get(id);
    return !d || depth > 8 ? {} : { ...(d.Parent ? fluidDef(d.Parent, depth + 1) : {}), ...d };
};

/** BlockType with the parent chain folded in: the child's keys win. */
function blockType(id, depth = 0) {
    const d = defs.get(id);
    if (!d || depth > 8) return {};
    return { ...(d.Parent ? blockType(d.Parent, depth + 1) : {}), ...(d.BlockType ?? {}) };
}

const cache = new Map();
function textureColor(rel) {
    const path = join(tmp, 'Common', rel);
    if (cache.has(path)) return cache.get(path);
    let out = null;
    if (existsSync(path)) {
        const { data } = PNG.sync.read(readFileSync(path));
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (n) out = [r / n, g / n, b / n];
    }
    cache.set(path, out);
    return out;
}

const hex = (s) => (/^#[0-9a-f]{6}/i.test(s ?? '') ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : null);
const first = (v) => (Array.isArray(v) ? v[0] : v);
const pack = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
const model = (bt) => (bt.CustomModel ?? '').replace(/.*\//, '').replace('.blockymodel', '');

/** What the map draws for a block: see the header for the codes. */
function shapeOf(id, bt) {
    if (bt.Material === 'Empty' && !/^Plant_/.test(id)) return 0;
    if (bt.DrawType === 'Empty') return 0;
    if (/^Plant_Leaves_/.test(id)) return 2;
    if (bt.Material === 'Solid') {
        const m = model(bt);
        if (/HalfBlock/.test(m)) return 4;
        if (bt.DrawType === 'Model' && /Fence|Spike|Statue|Barrel|Watering|Stalact|Stalagm|Torch|Lantern|Chain|Rope|Banner|Candle|Lamp|Chest|Crate|Bed|Table|Chair|Bench/.test(m)) return 0;
        return 1;
    }
    if (/^Plant_(Grass|Flower|Fern|Bush|Moss|Reeds|Crop|Sapling|Fruit|Mushroom|Bramble|Cactus|Coral|Seaweed|Kelp|Lily|Wheat)/.test(id) || /Cross|Bush|Dense/.test(model(bt))) return 3;
    return 0;
}

const colors = {};
const shapes = {};
const faces = {};
const uncolored = [];
for (const id of defs.keys()) {
    const bt = blockType(id);
    if (!Object.keys(bt).length) continue;
    const t = first(bt.Textures);
    const rel = t?.Up ?? t?.UpDown ?? t?.All ?? t?.Sides ?? first(bt.CustomModelTexture)?.Texture ?? null;
    const avg = rel && textureColor(rel);
    const shape = shapeOf(id, bt);
    if (shape !== 1) shapes[id] = shape;
    if (!avg) { uncolored.push(id); continue; }
    const tint = hex(first(bt.TintUp) ?? first(bt.Tint));
    const top = avg.map((v, i) => (tint ? (v * tint[i]) / 255 : v));
    colors[id] = pack(top);
    // Side and bottom colours, only where they differ enough from the top to matter.
    const sideRel = t?.Sides ?? t?.East ?? t?.North ?? t?.All ?? null;
    const downRel = t?.Down ?? t?.UpDown ?? null;
    const side = sideRel && textureColor(sideRel);
    const down = downRel && textureColor(downRel);
    const far = (a, b) => a && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 24;
    if (far(side, top) || far(down, top)) faces[id] = [pack(side ?? top), pack(down ?? side ?? top)];
}
for (const id of fluids.keys()) {
    const rel = first(fluidDef(id).Textures)?.All;
    const avg = rel && textureColor(rel);
    if (avg) colors[id] = pack(avg);
}

const hexc = (v) => `0x${v.toString(16).padStart(6, '0')}`;
const lines = Object.keys(colors).sort().map((k) => `    ${k}: ${hexc(colors[k])}`);
const shapeLines = Object.keys(shapes).sort().map((k) => `    ${k}: ${shapes[k]}`);
const faceLines = Object.keys(faces).sort().map((k) => `    ${k}: [${hexc(faces[k][0])}, ${hexc(faces[k][1])}]`);
const out = join(dirname(fileURLToPath(import.meta.url)), '../packages/core/src/data/blockColors.ts');
writeFileSync(
    out,
    `// Generated by scripts/gen-colors.mjs from Assets.zip. Do not edit by hand.
// One colour per block id, 0xRRGGBB: top texture average times tint.
export const blockColors: Record<string, number> = {
${lines.join(',\n')}
};

// Side and bottom colours for blocks where they differ from the top (grass over dirt).
export const faceColors: Record<string, [side: number, down: number]> = {
${faceLines.join(',\n')}
};

// What a block is when it is not a plain cube: 0 not drawn, 2 leaves, 3 cross-shaped plant, 4 half block.
export const blockShapes: Record<string, number> = {
${shapeLines.join(',\n')}
};

// Blocks that exist but have no flat texture to average (custom models, crops, torches): drawn gray, not as unknown.
export const uncoloredBlocks: ReadonlySet<string> = new Set([
${uncolored.sort().map((k) => `    '${k}'`).join(',\n')}
]);
`
);
rmSync(tmp, { recursive: true, force: true });
console.log(`${lines.length} colours, ${faceLines.length} with own sides, ${shapeLines.length} non-cube shapes, from ${defs.size} blocks and ${fluids.size} fluids -> ${out}`);
