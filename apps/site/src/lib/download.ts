export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
