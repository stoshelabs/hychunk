<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { Button, Icon, Scrollbar as vScrollbar } from '@vitral/vue';
import { close, externalLink } from '@vitral/icons';
import { usePage, type PageId } from '../composables/usePage';
import { t } from '../lib/i18n';
import { CONTACT_URL, legal, UPDATED } from '../lib/legal';

const route = usePage();
const labels: Record<PageId, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy', about: 'About HyChunk' };

const closeOnEscape = (e: KeyboardEvent) => e.key === 'Escape' && route.close();
onMounted(() => window.addEventListener('keydown', closeOnEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));
</script>

<template>
    <div v-if="route.page.value" class="legal-page" role="dialog" aria-modal="true" :aria-label="t('Legal')">
        <header>
            <nav :aria-label="t('Legal')">
                <button
                    v-for="id in route.pages"
                    :key="id"
                    :class="{ active: route.page.value === id }"
                    @click="route.open(id)"
                >
                    {{ t(labels[id]) }}
                </button>
            </nav>
            <Button
                :icon="close"
                variant="text"
                severity="secondary"
                size="small"
                :aria-label="t('Back to the map')"
                @click="route.close()"
            />
        </header>

        <div v-scrollbar class="scroller">
            <article :key="route.page.value">
                <h1>{{ t(legal[route.page.value].title) }}</h1>
                <p class="muted small">{{ t('Last updated') }}: {{ UPDATED }}</p>
                <p class="lead">{{ t(legal[route.page.value].intro) }}</p>
                <section v-for="s in legal[route.page.value].sections" :key="s.heading">
                    <h2>{{ t(s.heading) }}</h2>
                    <p v-for="p in s.paragraphs" :key="p">{{ t(p) }}</p>
                </section>
                <p class="contact">
                    <a :href="CONTACT_URL" target="_blank" rel="noopener">
                        {{ t('Project page on GitHub') }} <Icon :icon="externalLink" :size="13" />
                    </a>
                </p>
                <Button :label="t('Back to the map')" size="small" variant="outlined" @click="route.close()" />
            </article>
        </div>
    </div>
</template>

<style scoped>
.legal-page {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    background: var(--bg);
}
header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--header-height);
    padding: 0 14px;
    padding-top: env(safe-area-inset-top);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
}
nav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
}
nav button {
    padding: 7px 12px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
}
nav button:hover {
    color: var(--text);
}
nav button.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
}
.scroller {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 28px 16px calc(40px + env(safe-area-inset-bottom));
}
article {
    max-width: 720px;
    margin: 0 auto;
}
h1 {
    margin: 0 0 4px;
    font-size: 26px;
}
h2 {
    margin: 26px 0 6px;
    font-size: 16px;
}
p {
    margin: 0 0 10px;
    line-height: 1.6;
}
.lead {
    margin-top: 14px;
    font-size: 15px;
}
.contact {
    margin-top: 28px;
}
.contact a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
</style>
