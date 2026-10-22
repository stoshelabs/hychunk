import { ref } from 'vue';

export type PageId = 'terms' | 'privacy' | 'about';

const PAGES: PageId[] = ['terms', 'privacy', 'about'];

function fromAddress(): PageId | null {
    const asked = new URLSearchParams(location.search).get('page');
    return PAGES.find((p) => p === asked) ?? null;
}

/** The legal page being read, if any. It lives in the address (`?page=terms`), so it can be linked and the back button closes it. */
const page = ref<PageId | null>(fromAddress());

function write(next: PageId | null, push: boolean) {
    const params = new URLSearchParams(location.search);
    if (next) params.set('page', next);
    else params.delete('page');
    const search = params.toString();
    const url = `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
}

if (typeof window !== 'undefined') window.addEventListener('popstate', () => (page.value = fromAddress()));

export function usePage() {
    return {
        page,
        pages: PAGES,
        open(next: PageId) {
            if (page.value === next) return;
            const switching = page.value !== null;
            page.value = next;
            write(next, !switching);
        },
        close() {
            if (!page.value) return;
            page.value = null;
            write(null, false);
        }
    };
}
