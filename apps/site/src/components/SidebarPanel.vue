<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { Button, Icon, Scrollbar as vScrollbar } from '@vitral/vue';
import { chevronLeft, close, filter as filterIcon, folderOpen, map as mapIcon, scale } from '@vitral/icons';
import { useLayout } from '../composables/useLayout';
import { usePlaces } from '../composables/usePlaces';
import { useSession } from '../composables/useSession';
import { t } from '../lib/i18n';
import LegalPanel from './LegalPanel.vue';
import MapPanel from './MapPanel.vue';
import PlacesPanel from './PlacesPanel.vue';
import WorldPanel from './WorldPanel.vue';

const layout = useLayout();

const closeOnEscape = (e: KeyboardEvent) => e.key === 'Escape' && layout.closeOnMobile();
onMounted(() => window.addEventListener('keydown', closeOnEscape));
onBeforeUnmount(() => window.removeEventListener('keydown', closeOnEscape));
const places = usePlaces();
const session = useSession();
</script>

<template>
    <div v-if="layout.isMobile.value && layout.sidebarOpen.value" class="backdrop" @click="layout.toggleSidebar()" />
    <aside v-if="session.world.value" :class="{ open: layout.sidebarOpen.value }">
        <nav class="rail" :aria-label="t('Sections')">
            <button
                data-tour="tab-places"
                :class="{ active: layout.tab.value === 'places' }"
                @click="layout.showTab('places')"
            >
                <Icon :icon="filterIcon" :size="18" />
                <span>{{ t('Places') }}</span>
                <b v-if="places.places.value.length">{{ places.places.value.length }}</b>
            </button>
            <button data-tour="tab-map" :class="{ active: layout.tab.value === 'map' }" @click="layout.showTab('map')">
                <Icon :icon="mapIcon" :size="18" />
                <span>{{ t('Map') }}</span>
            </button>
            <button
                data-tour="tab-world"
                :class="{ active: layout.tab.value === 'world' }"
                @click="layout.showTab('world')"
            >
                <Icon :icon="folderOpen" :size="18" />
                <span>{{ t('World') }}</span>
            </button>
            <button
                data-tour="tab-legal"
                :class="{ active: layout.tab.value === 'legal' }"
                @click="layout.showTab('legal')"
            >
                <Icon :icon="scale" :size="18" />
                <span>{{ t('Legal') }}</span>
            </button>
            <Button
                v-if="layout.isMobile.value"
                class="close"
                :icon="close"
                variant="text"
                severity="secondary"
                size="small"
                :aria-label="t('Close menu')"
                @click="layout.toggleSidebar()"
            />
        </nav>

        <div v-scrollbar class="panel" :class="{ fixed: layout.tab.value === 'places' }">
            <div class="title">
                <div>
                    <h2>{{ session.world.value.name }}</h2>
                    <span v-if="!session.isSeedWorld.value" class="muted small"
                        >{{ t('Seed') }} {{ session.seedText.value }}</span
                    >
                </div>
                <Button
                    v-if="!layout.isMobile.value"
                    :icon="chevronLeft"
                    variant="text"
                    severity="secondary"
                    size="small"
                    :aria-label="t('Collapse sidebar')"
                    @click="layout.toggleSidebar()"
                />
            </div>
            <PlacesPanel v-show="layout.tab.value === 'places'" />
            <MapPanel v-show="layout.tab.value === 'map'" />
            <WorldPanel v-show="layout.tab.value === 'world'" />
            <LegalPanel v-show="layout.tab.value === 'legal'" />
        </div>
    </aside>
</template>

<style scoped>
aside {
    display: flex;
    flex: none;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--surface);
}
.rail {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    width: var(--rail-width);
    padding: 10px 6px;
    border-right: 1px solid var(--line);
}
.rail button:not(.close) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 2px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
}
.rail button.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
}
.rail b {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--accent);
    color: #111;
    font-size: 9.5px;
    line-height: 16px;
}
.panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: var(--panel-width);
    min-width: 0;
    padding: 14px;
    overflow-x: hidden;
    overflow-y: auto;
}
.panel.fixed {
    overflow: hidden;
}
.title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
}
h2 {
    margin: 0;
    font-size: 15px;
}

aside:not(.open) .panel {
    display: none;
}

@media (max-width: 768px) {
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 70;
        background: rgba(5, 8, 13, 0.6);
        backdrop-filter: blur(2px);
    }
    aside {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 80;
        flex-direction: column;
        width: min(88vw, 380px);
        height: 100dvh;
        border: 0;
        border-right: 1px solid var(--line-strong);
        box-shadow: 8px 0 40px rgba(0, 0, 0, 0.55);
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        transition: transform 0.22s ease;
        transform: translateX(-100%);
        visibility: hidden;
    }
    aside.open {
        transform: translateX(0);
        visibility: visible;
    }
    aside:not(.open) .panel {
        display: flex;
    }
    .rail {
        flex-direction: row;
        width: auto;
        padding: 8px 10px;
        border: 0;
        border-bottom: 1px solid var(--line);
    }
    .rail button:not(.close) {
        flex: 1;
        flex-direction: row;
        justify-content: center;
        gap: 6px;
        padding: 10px 4px;
        font-size: 13px;
    }
    .rail .close {
        margin-left: 4px;
        flex: none;
    }
    .rail b {
        position: static;
        margin-left: 2px;
    }
    .panel {
        flex: 1;
        width: auto;
    }
}
</style>
