export type BsonValue = number | bigint | string | boolean | null | Date | Uint8Array | BsonValue[] | BsonDocument;
export interface BsonDocument {
    [key: string]: BsonValue;
}

const text = new TextDecoder();

/** Decodes the BSON subset Hytale writes. Binary values are views onto `bytes`, not copies. */
export function decodeBson(bytes: Uint8Array): BsonDocument {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return readDocument(bytes, view, 0).value as BsonDocument;
}

function readDocument(
    bytes: Uint8Array,
    view: DataView,
    start: number,
    asArray = false
): { value: BsonValue; end: number } {
    const length = view.getInt32(start, true);
    const end = start + length;
    const out: BsonDocument | BsonValue[] = asArray ? [] : {};
    let p = start + 4;
    while (p < end - 1) {
        const type = bytes[p++]!;
        let keyEnd = p;
        while (bytes[keyEnd] !== 0) keyEnd++;
        const key = text.decode(bytes.subarray(p, keyEnd));
        p = keyEnd + 1;
        let value: BsonValue;
        switch (type) {
            case 0x01:
                value = view.getFloat64(p, true);
                p += 8;
                break;
            case 0x02: {
                const n = view.getInt32(p, true);
                value = text.decode(bytes.subarray(p + 4, p + 3 + n));
                p += 4 + n;
                break;
            }
            case 0x03:
            case 0x04: {
                const r = readDocument(bytes, view, p, type === 0x04);
                value = r.value;
                p = r.end;
                break;
            }
            case 0x05: {
                const n = view.getInt32(p, true);
                value = bytes.subarray(p + 5, p + 5 + n);
                p += 5 + n;
                break;
            }
            case 0x06:
            case 0xff:
            case 0x7f:
                value = null;
                break;
            case 0x0b: {
                // Regular expression: two C strings.
                let e1 = p;
                while (bytes[e1] !== 0) e1++;
                let e2 = e1 + 1;
                while (bytes[e2] !== 0) e2++;
                value = text.decode(bytes.subarray(p, e1));
                p = e2 + 1;
                break;
            }
            case 0x0d:
            case 0x0e: {
                const n = view.getInt32(p, true);
                value = text.decode(bytes.subarray(p + 4, p + 3 + n));
                p += 4 + n;
                break;
            }
            case 0x0f: {
                const n = view.getInt32(p, true);
                value = null;
                p += n;
                break;
            }
            case 0x13:
                value = bytes.slice(p, p + 16);
                p += 16;
                break;
            case 0x07:
                value = bytes.subarray(p, p + 12).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
                p += 12;
                break;
            case 0x08:
                value = bytes[p++] === 1;
                break;
            case 0x09:
                value = new Date(Number(view.getBigInt64(p, true)));
                p += 8;
                break;
            case 0x0a:
                value = null;
                break;
            case 0x10:
                value = view.getInt32(p, true);
                p += 4;
                break;
            case 0x11: {
                value = Number(view.getBigUint64(p, true));
                p += 8;
                break;
            }
            case 0x12: {
                const big = view.getBigInt64(p, true);
                value =
                    big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER)
                        ? Number(big)
                        : big;
                p += 8;
                break;
            }
            default:
                throw new Error(`Unsupported BSON type 0x${type.toString(16)} at key "${key}"`);
        }
        if (asArray) (out as BsonValue[]).push(value);
        else (out as BsonDocument)[key] = value;
    }
    return { value: out, end };
}
