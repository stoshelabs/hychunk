import { onBeforeUnmount, onMounted, ref } from 'vue';

export type SidebarTab = 'places' | 'map' | 'world';

const MOBILE_QUERY = '(max-width: 768px)';

const tab = ref<SidebarTab>('places');
const sidebarOpen = ref(typeof matchMedia === 'undefined' || !matchMedia(MOBILE_QUERY).matches);
const isMobile = ref(typeof matchMedia !== 'undefined' && matchMedia(MOBILE_QUERY).matches);

export function useLayout() {
    let query: MediaQueryList | null = null;
    const onChange = (e: MediaQueryListEvent) => {
        isMobile.value = e.matches;
        sidebarOpen.value = !e.matches;
    };

    onMounted(() => {
        query = matchMedia(MOBILE_QUERY);
        query.addEventListener('change', onChange);
    });
    onBeforeUnmount(() => query?.removeEventListener('change', onChange));

    function showTab(next: SidebarTab) {
        tab.value = next;
        sidebarOpen.value = true;
    }

    const closeOnMobile = () => {
        if (isMobile.value) sidebarOpen.value = false;
    };

    return {
        tab,
        sidebarOpen,
        isMobile,
        showTab,
        closeOnMobile,
        toggleSidebar: () => (sidebarOpen.value = !sidebarOpen.value)
    };
}
