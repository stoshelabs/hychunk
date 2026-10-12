<script setup lang="ts">
import { computed } from 'vue';
import { useGameData } from '../composables/useGameData';
import { useSession } from '../composables/useSession';
import { LOGO_URL } from '../lib/assets';
import { t } from '../lib/i18n';

const game = useGameData();
const session = useSession();

const loadingData = computed(() => game.state.value === 'loading');
const visible = computed(() => loadingData.value || (!!session.world.value && !session.firstScreen.value.settled));
const percent = computed(() => session.firstScreen.value.percent);
const indeterminate = computed(() => loadingData.value || percent.value === 0);
</script>

<template>
    <div v-if="visible" class="splash" role="status" aria-live="polite">
        <div class="card">
            <img :src="LOGO_URL" alt="" width="72" height="72" />
            <strong>HyChunk</strong>
            <p>{{ loadingData ? t('Loading game data') : t('Preparing the map') }}</p>
            <div class="bar">
                <i :class="{ indeterminate }" :style="{ width: indeterminate ? '40%' : `${percent}%` }" />
            </div>
            <b class="percent" :class="{ hidden: loadingData }">{{ percent }}%</b>
        </div>
    </div>
</template>

<style scoped>
.splash {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: var(--bg);
}
.card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    min-width: 240px;
    padding: 0 24px;
}
.card strong {
    font-size: 20px;
    letter-spacing: 0.02em;
}
.card p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
}
.percent {
    color: var(--text);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}
.percent.hidden {
    visibility: hidden;
}
.bar {
    width: min(240px, 70vw);
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--surface-2);
}
.bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.25s;
}
.bar i.indeterminate {
    animation: slide 1.1s ease-in-out infinite;
}
@keyframes slide {
    0% {
        margin-left: -40%;
    }
    100% {
        margin-left: 100%;
    }
}
</style>
