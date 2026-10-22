<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@vitral/vue';
import { locate } from '@vitral/icons';
import type { PlayerPosition } from '@hychunk/core';
import { useLayout } from '../composables/useLayout';
import { useSession } from '../composables/useSession';
import { ago } from '../lib/ago';
import { t } from '../lib/i18n';
import CollapseSection from './CollapseSection.vue';
import PlayerFace from './PlayerFace.vue';

const session = useSession();
const layout = useLayout();

const players = computed(() => session.world.value?.players ?? []);
const MAX_PEEK = 5;

function goTo(p: PlayerPosition) {
    session.goTo(p.x, p.z, 3);
    layout.closeOnMobile();
}
</script>

<template>
    <CollapseSection
        v-if="players.length"
        id="players"
        :title="t('Players')"
        :count="players.length"
        data-tour="places-players"
    >
        <template #peek>
            <span class="peek">
                <PlayerFace v-for="p in players.slice(0, MAX_PEEK)" :key="p.uuid ?? p.name" :player="p" :size="20" />
            </span>
        </template>
        <ul>
            <li v-for="p in players" :key="p.uuid ?? p.name">
                <button :title="t('Go to player {name}', { name: p.name })" @click="goTo(p)">
                    <PlayerFace :player="p" :size="34" />
                    <span class="text">
                        <strong>{{ p.name }}</strong>
                        <small>
                            {{ Math.round(p.x) }}, {{ Math.round(p.z) }}
                            <template v-if="p.seen"> · {{ ago(p.seen) }}</template>
                        </small>
                    </span>
                    <Icon :icon="locate" :size="14" />
                </button>
            </li>
        </ul>
    </CollapseSection>
</template>

<style scoped>
.peek {
    display: flex;
}
.peek > * + * {
    margin-left: -6px;
}
ul {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 190px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
}
button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    text-align: left;
}
button:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--accent);
}
.text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}
strong {
    overflow: hidden;
    color: var(--text);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
small {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
</style>
