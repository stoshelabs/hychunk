const SKIN_API = 'https://api.hytl.skin/headshot';

const heads = new Map<string, { img: HTMLImageElement; failed: boolean }>();

/**
 * A player's face from the skin service (by id, then by name), or `null` while it loads and when the service does not know the
 * player: the plain pin is the fallback.
 */
export function playerHead(p: { name: string; uuid?: string }, onLoaded: () => void): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    const key = p.uuid ?? p.name;
    let h = heads.get(key);
    if (!h) {
        const tries = [p.uuid, p.name].filter((v): v is string => !!v);
        const url = (i: number) => `${SKIN_API}/${encodeURIComponent(tries[i]!)}?size=64`;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const entry = { img, failed: false };
        let attempt = 0;
        img.onload = onLoaded;
        img.onerror = () => {
            if (++attempt < tries.length) img.src = url(attempt);
            else entry.failed = true;
        };
        img.src = url(0);
        heads.set(key, (h = entry));
    }
    return !h.failed && h.img.complete && h.img.naturalWidth > 0 ? h.img : null;
}

const markerIcons = new Map<string, HTMLImageElement>();

/** A marker icon from `/markers`, or `null` until it has loaded (`onLoaded` is called then). */
export function getMarkerImage(name: string, onLoaded: () => void): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    let img = markerIcons.get(name);
    if (!img) {
        img = new Image();
        img.src = `/markers/${name}.png`;
        img.onload = onLoaded;
        markerIcons.set(name, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
}
