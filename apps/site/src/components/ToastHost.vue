<script setup lang="ts">
import { Icon } from '@vitral/vue';
import { check } from '@vitral/icons';
import { useToast } from '../composables/useToast';

const { message } = useToast();
</script>

<template>
    <div v-if="message" class="toast" role="status">
        <Icon :icon="check" :size="16" />
        <span>{{ message }}</span>
    </div>
</template>

<style scoped>
.toast {
    position: fixed;
    left: 50%;
    bottom: calc(24px + env(safe-area-inset-bottom));
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
    transform: translateX(-50%);
    border: 1px solid var(--accent-line);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    font-size: 13px;
}
</style>
