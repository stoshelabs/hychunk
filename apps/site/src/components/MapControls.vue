<script setup lang="ts">
import { Icon, Tooltip as vTooltip } from '@vitral/vue';
import { locate, maximize, minus, plus, ruler } from '@vitral/icons';
import { useSession } from '../composables/useSession';
import { t } from '../lib/i18n';

const session = useSession();
</script>

<template>
    <div class="controls" data-tour="controls" role="toolbar" :aria-label="t('Map controls')">
        <button v-tooltip.left="t('Zoom in')" :aria-label="t('Zoom in')" @click="session.map.value?.zoomBy(1.6)">
            <Icon :icon="plus" :size="16" />
        </button>
        <button v-tooltip.left="t('Zoom out')" :aria-label="t('Zoom out')" @click="session.map.value?.zoomBy(1 / 1.6)">
            <Icon :icon="minus" :size="16" />
        </button>
        <i />
        <button v-tooltip.left="t('Go to spawn')" :aria-label="t('Go to spawn')" @click="session.goToSpawn()">
            <Icon :icon="locate" :size="16" />
        </button>
        <button
            v-tooltip.left="t('Fit to the explored area')"
            :aria-label="t('Fit to the explored area')"
            @click="session.map.value?.fit()"
        >
            <Icon :icon="maximize" :size="16" />
        </button>
        <button
            v-tooltip.left="t('Measure distance')"
            :aria-label="t('Measure distance')"
            :class="{ on: session.measuring.value }"
            :aria-pressed="session.measuring.value"
            @click="session.toggleMeasure()"
        >
            <Icon :icon="ruler" :size="16" />
        </button>
    </div>
</template>

<style scoped>
.controls {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 6;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: rgba(17, 22, 31, 0.92);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
}
button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
}
button:hover {
    background: rgba(255, 255, 255, 0.08);
}
button.on {
    background: var(--accent-soft);
    color: var(--accent);
}
i {
    height: 1px;
    margin: 3px 6px;
    background: var(--line-strong);
}

@media (max-width: 768px) {
    .controls {
        top: 10px;
        right: 10px;
    }
    button {
        width: 42px;
        height: 42px;
    }
}
</style>
