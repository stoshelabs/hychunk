import { ref } from 'vue';

const message = ref('');
let timer = 0;

export function useToast() {
    function show(text: string, ms = 3000) {
        message.value = text;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (message.value = ''), ms);
    }

    return { message, show };
}
