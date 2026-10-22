<script setup lang="ts">
import { usePage } from '../composables/usePage';
import { t } from '../lib/i18n';

withDefaults(defineProps<{ links?: boolean }>(), { links: true });
const route = usePage();

const year = new Date().getFullYear();
</script>

<template>
    <p class="legal muted small">
        &copy; {{ year }} HyChunk, by
        <a href="https://github.com/stoshelabs" target="_blank" rel="noopener">Stoshe Labs</a>.
        {{ t('Free software under the LGPL-3.0.') }}
        <br />
        {{
            t(
                'HyChunk is an independent community project. It is not an official Hytale product and is not affiliated with or endorsed by Hypixel Studios. Hytale is a trademark of its owner.'
            )
        }}
        <template v-if="links">
            <br />
            <button @click="route.open('about')">{{ t('About') }}</button> ·
            <button @click="route.open('terms')">{{ t('Terms') }}</button> ·
            <button @click="route.open('privacy')">{{ t('Privacy') }}</button>
        </template>
    </p>
</template>

<style scoped>
.legal {
    max-width: 640px;
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    text-align: center;
}
a,
button {
    padding: 0;
    border: 0;
    background: none;
    font-size: inherit;
    color: inherit;
    text-decoration: underline;
}
a:hover,
button:hover {
    color: var(--accent);
}
</style>
