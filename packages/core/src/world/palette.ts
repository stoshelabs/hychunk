export const SECTION_SIZE = 32;
export const SECTION_BLOCKS = 32768;

export interface SectionPalette {
    /** Block (or fluid) name for each palette entry; entry 0 is normally `Empty`. */
    names: string[];
    /** For each of the 32768 blocks (`y << 10 | z << 5 | x`), its index into `names`. */
    indices: Uint16Array;
    /** Offset just past the palette, where the next field of the section starts. */
    end: number;
}

const text = new TextDecoder();

/**
 * One section palette, as the server writes it: a type byte (0 empty, 1 half-byte,
 * 2 byte, 3 short), `u16` entry count, entries of `{id, name (u16 length + utf8),
 * u16 block count}`, then one id per block. Ids are 4, 8 or 16 bits wide.
 */
export function readSectionPalette(bytes: Uint8Array, offset: number): SectionPalette {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const type = bytes[offset]!;
    let p = offset + 1;
    const indices = new Uint16Array(SECTION_BLOCKS);
    if (type === 0) return { names: ['Empty'], indices, end: p };
    if (type > 3) throw new Error(`Unknown palette type ${type}`);

    const count = view.getUint16(p);
    p += 2;
    const names: string[] = [];
    // Ids are small integers, so a lookup table beats a Map for 32768 blocks.
    const lut = new Uint16Array(type === 3 ? 65536 : 256);
    for (let i = 0; i < count; i++) {
        let id: number;
        if (type === 3) {
            id = view.getUint16(p);
            p += 2;
        } else id = bytes[p++]!;
        const length = view.getUint16(p);
        names.push(text.decode(bytes.subarray(p + 2, p + 2 + length)));
        p += 2 + length + 2;
        lut[id] = i;
    }

    if (type === 1) {
        for (let i = 0, j = p; i < SECTION_BLOCKS; i += 2, j++) {
            const b = bytes[j]!;
            indices[i] = lut[b >> 4]!;
            indices[i + 1] = lut[b & 15]!;
        }
        p += SECTION_BLOCKS / 2;
    } else if (type === 2) {
        for (let i = 0; i < SECTION_BLOCKS; i++) indices[i] = lut[bytes[p + i]!]!;
        p += SECTION_BLOCKS;
    } else {
        for (let i = 0; i < SECTION_BLOCKS; i++) indices[i] = lut[(bytes[p + i * 2]! << 8) | bytes[p + i * 2 + 1]!]!;
        p += SECTION_BLOCKS * 2;
    }
    return { names, indices, end: p };
}
