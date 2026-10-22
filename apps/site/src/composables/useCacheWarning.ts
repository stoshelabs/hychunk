import { computed, ref, watch } from 'vue';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';
import { useSession } from './useSession';

/** What this browser has saved for the site (maps, structures, data packs) above which the map can get slow or freeze. */
const HEAVY_BYTES = 600 * 1024 * 1024;
/** Or this share of the space the browser allows the site, when it says. */
const HEAVY_SHARE = 0.6;
const RECHECK_MS = 5 * 60 * 1000;

const used = ref(0);
const heavy = ref(false);
/** "Not now": hides it until the page is opened again. "Ignore" is remembered. */
const snoozed = ref(false);
const ignored = ref(readStorage(STORAGE_KEYS.ignoreCacheWarning) === '1');
let timer = 0;

async function check() {
    try {
        const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
        used.value = usage;
        heavy.value = usage >= HEAVY_BYTES || (quota > 0 && usage / quota >= HEAVY_SHARE);
    } catch {
        heavy.value = false; // a browser that cannot tell cannot warn
    }
}

export function useCacheWarning() {
    const session = useSession();
    const visible = computed(() => heavy.value && !ignored.value && !snoozed.value && !!session.world.value);

    return { used, visible, check, start, ignore, snooze, clear };

    function start() {
        void check();
        window.clearInterval(timer);
        timer = window.setInterval(check, RECHECK_MS);
        watch(session.world, () => void check());
    }
    function ignore() {
        ignored.value = true;
        writeStorage(STORAGE_KEYS.ignoreCacheWarning, '1');
    }
    function snooze() {
        snoozed.value = true;
    }
    async function clear() {
        await session.clearCache();
        await check();
    }
}
