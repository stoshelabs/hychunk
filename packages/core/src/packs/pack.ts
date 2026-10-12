import { fromBlob, type ByteSource } from '../storage/source';
import { ZipReader } from './zip';

/** A source of game files: the game's `Assets.zip`, or the assets a plugin ships in its jar. Same layout in both (`Common/…`, `Server/…`). */
export interface AssetPack {
    name: string;
    has(path: string): boolean;
    list(prefix?: string): string[];
    read(path: string): Promise<Uint8Array>;
}

export async function openZipPack(name: string, source: ByteSource): Promise<AssetPack> {
    const zip = await ZipReader.open(source);
    return { name, has: (p) => zip.has(p), list: (p) => zip.list(p), read: (p) => zip.read(p) };
}

/** From a `File` the user picked (an `Assets.zip` or a plugin `.jar`). */
export function openZipFile(file: File) {
    return openZipPack(file.name, fromBlob(file));
}

export async function readJson<T = any>(pack: AssetPack, path: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await pack.read(path))) as T;
}
