# Hytale world format (as read by HyChunk)

Worked out from real saves, server 2026. Anything marked **open** is not decoded yet.

## Layout

`universe/worlds/<name>/` holds `config.json` (seed, spawn, world generator),
`resources/` (map markers and other world state) and `chunks/X.Z.region.bin`.
`X.Z` are region coordinates; a region is 32×32 chunks.

## `*.region.bin`

All integers big-endian.

| Offset | Size | |
| --- | --- | --- |
| 0 | 20 | magic `HytaleIndexedStorage` |
| 20 | 4 | version (1) |
| 24 | 4 | slot count (1024) |
| 28 | 4 | segment size (4096) |
| 32 | 4 × slots | per slot: 1-based segment where its blob starts, 0 when empty |
| 32 + 4 × slots | | segments |

Slot = `x + z * 32`, with x and z local to the region. Segment `n` starts at
`32 + 4 × slots + (n − 1) × segmentSize`. A blob is `u32 uncompressedLength`,
`u32 compressedLength`, then a zstd frame holding one BSON document.

## Chunk BSON

Top level `Components`: `ChunkColumn.Sections[]` (10 sections of 32 blocks, y 0–319),
`BlockChunk` (`Version`, `Data`), `EnvironmentChunk.Data`, `BlockHealthChunk.Data`,
`BlockComponentChunk`, `EntityChunk.Entities`. Each section has `Block`, `Fluid`
and `BlockPhysics` components, each with a `Data` binary.

### Damaged slots

Long-lived saves can have slots whose segment holds no blob (49 of 1024 in a
2 GB region here). The reader checks the blob header and the zstd magic and
throws `CorruptChunkError`; the rest of the region reads normally. A map should
leave that chunk blank.

## Section palettes (`Block.Data`, `Fluid.Data`)

`Block.Data` starts with a `u32` (a migration count) that `Fluid.Data` does not
have. Then, big-endian:

| Field | |
| --- | --- |
| `u8` type | 0 empty, 1 half-byte (4-bit ids), 2 byte, 3 short |
| `u16` count | entries (absent when empty) |
| entries | `{id: u8 (u16 for short), name: u16 length + utf8, blocks: u16}` |
| ids | one per block, 32768: half-byte packs two per byte, **high nibble first** |

Block index in a section is `y << 10 | z << 5 | x`; a column is `z << 5 | x`.
`Block.Data` carries more after the palette (filler and rotation palettes,
light) that HyChunk does not read yet.

## Heights, fluids and colours

- `BlockChunk.Data` holds a height palette (`u16` count, `u16` keys, `i32` byte
  length, 10-bit packed indices) and a tint palette. In saved chunks the heights
  are mostly 0, so HyChunk **does not use them**: it scans sections top-down.
- A column's fluid can sit *below* its top block (lava at y 11–35 under grass), so
  a map should draw a fluid only when it is higher than the block.
- Colours come from `Assets.zip` (`node scripts/gen-colors.mjs`): average of
  the block's top texture times its `TintUp`/`Tint`, following `Parent`. Water's
  texture is white (tinted per biome in game), so the map uses its own blue.

**Open:** `EnvironmentChunk` (biomes), tint palettes, entities, and how the
`resources/*.json` map markers are shaped.
