// Reads a dropped folder the way the folder picker would: every File carries a `webkitRelativePath` such as
// "<dropped folder>/chunks/0.0.region.bin", which is what listWorlds and loadWorldFromFiles look at.

const SKIPPED_DIRS = new Set(['.git', 'node_modules', 'logs', 'backups']);
const SKIPPED_EXTENSIONS = ['.jar', '.zip', '.log'];

const isSkipped = (name: string, directory: boolean) =>
    directory ? SKIPPED_DIRS.has(name) : SKIPPED_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

/** `readEntries` returns the directory in batches; it is done when it returns an empty one. */
async function readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
    const reader = directory.createReader();
    const entries: FileSystemEntry[] = [];
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) return entries;
        entries.push(...batch);
    }
}

export function pickedPath(file: File) {
    return (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name;
}

async function walk(entry: FileSystemEntry, path: string, out: File[], onCount: (n: number) => void) {
    if (isSkipped(entry.name, entry.isDirectory)) return;
    if (entry.isFile) {
        const file = await readFile(entry as FileSystemFileEntry);
        Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
        out.push(file);
        if (out.length % 50 === 0) onCount(out.length);
        return;
    }
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) {
        await walk(child, `${path}/${child.name}`, out, onCount);
    }
}

/** The files of whatever was dropped (folders are walked recursively). */
export async function filesFromDrop(data: DataTransfer, onCount: (n: number) => void): Promise<File[]> {
    // the entries must be taken before the first await: the drop data goes away after the event
    const entries = [...data.items].map((item) => item.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
    const out: File[] = [];
    for (const entry of entries) await walk(entry, entry.name, out, onCount);
    onCount(out.length);
    return out;
}
