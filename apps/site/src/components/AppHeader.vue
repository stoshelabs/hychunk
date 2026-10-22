<script setup lang="ts">
import { computed } from 'vue';
import { Icon, Select } from '@vitral/vue';
import { globe, helpCircle, menu } from '@vitral/icons';
import { useGameData } from '../composables/useGameData';
import { useLayout } from '../composables/useLayout';
import { useSession } from '../composables/useSession';
import { useTour } from '../composables/useTour';
import { LOGO_URL } from '../lib/assets';
import { lang, langs, languages, setLang, t, type Lang } from '../lib/i18n';

const game = useGameData();
const layout = useLayout();
const session = useSession();
const tour = useTour();

// the newest game version first
const versions = computed(() =>
    [...game.versions.value]
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
        .map((v) => ({ value: v.id, label: v.label.replace(/^Hytale\s+/i, '') }))
);
const languageOptions = langs.map((value) => ({ value, label: languages[value].name, short: languages[value].short }));
</script>

<template>
    <header>
        <button
            v-if="layout.isMobile.value && session.world.value"
            class="menu"
            :aria-label="t('Open menu')"
            :aria-expanded="layout.sidebarOpen.value"
            @click="layout.toggleSidebar()"
        >
            <Icon :icon="menu" :size="20" />
        </button>
        <a class="brand" href="./" aria-label="HyChunk">
            <img :src="LOGO_URL" alt="" width="26" height="26" />
            <strong>HyChunk</strong>
        </a>
        <span class="grow" />

        <span
            class="status"
            data-tour="version"
            :class="game.state.value"
            :title="game.error.value || t('Game version of the map data')"
        >
            <span class="dot" />
            <Select
                :modelValue="game.versionId.value"
                :options="versions"
                optionLabel="label"
                optionValue="value"
                size="small"
                class="version"
                :disabled="game.state.value === 'loading' || !versions.length"
                :placeholder="game.state.value === 'error' ? t('Data unavailable') : '...'"
                :aria-label="t('Game version')"
                appendTo="body"
                placement="bottom-end"
                @update:modelValue="game.select($event as string)"
            />
        </span>

        <Select
            :modelValue="lang"
            :options="languageOptions"
            optionLabel="label"
            optionValue="value"
            size="small"
            class="language"
            data-tour="language"
            :aria-label="t('Language')"
            appendTo="body"
            placement="bottom-end"
            @update:modelValue="setLang($event as Lang)"
        >
            <template #value="{ value }">
                <span class="current"><Icon :icon="globe" :size="14" />{{ languages[value as Lang]?.short }}</span>
            </template>
        </Select>

        <button
            class="tour"
            data-tour="tour"
            :title="t('Take the tour')"
            :aria-label="t('Take the tour')"
            @click="tour.start()"
        >
            <Icon :icon="helpCircle" :size="20" />
        </button>
    </header>
</template>

<style scoped>
header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--header-height);
    padding: 0 14px;
    padding-top: env(safe-area-inset-top);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
}
.brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
    text-decoration: none;
}
.brand strong {
    font-size: 15px;
    letter-spacing: 0.02em;
}
.grow {
    flex: 1;
}
.status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--muted);
}
.ready .dot {
    background: #34d399;
    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18);
}
.loading .dot {
    background: var(--accent);
}
.error .dot {
    background: #f87171;
}
/* Vitral components do not take this component's scope attribute, so their styles are reached through :deep */
header :deep(.version) {
    width: 104px;
}
header :deep(.language) {
    width: 86px;
}
header :deep(.version),
header :deep(.language) {
    height: 36px;
    min-height: 36px;
}
header :deep(.vt-select-label) {
    display: flex;
    align-items: center;
    height: 100%;
    line-height: 1;
}
.tour {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
}
.tour:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
}
.current {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1;
}

@media (max-width: 768px) {
    header {
        padding: 0 10px;
    }
    .brand strong {
        display: none;
    }
}
</style>
