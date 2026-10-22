import { ref } from 'vue';

const open = ref(false);

export function useTour() {
    return { open, start: () => (open.value = true), stop: () => (open.value = false) };
}
