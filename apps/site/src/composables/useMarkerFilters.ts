import { ref } from 'vue';
import type { MarkerFilters } from '@hychunk/map';
import { allFilters } from '../lib/markers';

const filters = ref<MarkerFilters>(allFilters(true));

export function useMarkerFilters() {
    const toggle = (category: keyof MarkerFilters) =>
        (filters.value = { ...filters.value, [category]: !filters.value[category] });
    const setAll = (on: boolean) => (filters.value = allFilters(on));

    return { filters, toggle, setAll };
}
