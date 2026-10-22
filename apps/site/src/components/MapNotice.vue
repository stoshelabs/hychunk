<script setup lang="ts">
import { usePage } from '../composables/usePage';
import { t } from '../lib/i18n';

const route = usePage();
</script>

<template>
    <div class="notice" data-tour="notice">
        <span class="text">{{ t('HyChunk is an unofficial community project.') }}</span>
        <nav class="links" :aria-label="t('Legal')">
            <button @click="route.open('about')">{{ t('About') }}</button>
            <button @click="route.open('terms')">{{ t('Terms') }}</button>
            <button @click="route.open('privacy')">{{ t('Privacy') }}</button>
        </nav>
    </div>
</template>

<style scoped>
.notice {
    position: absolute;
    right: 14px;
    bottom: calc(14px + env(safe-area-inset-bottom));
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100% - 28px);
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(17, 22, 31, 0.78);
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    backdrop-filter: blur(6px);
}
.links {
    display: flex;
    flex: none;
    gap: 10px;
}
button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    font-size: inherit;
    text-decoration: underline;
}
button:hover {
    color: var(--accent);
}

@media (max-width: 768px) {
    /* the status bar takes the left side; the notice sits above it instead of over the map's edge */
    .notice {
        left: 14px;
        bottom: calc(58px + env(safe-area-inset-bottom));
        flex-wrap: wrap;
        gap: 2px 12px;
    }
}
</style>
