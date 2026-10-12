<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useContextMenu } from '../composables/useContextMenu';
import { usePlaces } from '../composables/usePlaces';
import { useSession } from '../composables/useSession';
import { t } from '../lib/i18n';
import ContextMenu from './ContextMenu.vue';
import MapControls from './MapControls.vue';
import PlaceDetails from './PlaceDetails.vue';
import StatusHud from './StatusHud.vue';

const session = useSession();
const places = usePlaces();
const menu = useContextMenu();

const canvas = ref<HTMLCanvasElement>();

function dismiss(e: Event) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    menu.close();
    if (e instanceof KeyboardEvent) places.closeDetails();
}

onMounted(() => {
    session.attachCanvas(canvas.value ?? null);
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
});

onBeforeUnmount(() => {
    window.removeEventListener('click', dismiss);
    window.removeEventListener('keydown', dismiss);
    session.attachCanvas(null);
});
</script>

<template>
    <section>
        <canvas
            v-show="session.world.value"
            ref="canvas"
            :aria-label="t('World map')"
            @contextmenu.prevent="canvas && menu.open($event, canvas)"
        />
        <template v-if="session.world.value">
            <MapControls />
            <StatusHud />
            <PlaceDetails />
        </template>
        <ContextMenu />
    </section>
</template>

<style scoped>
section {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
}
</style>
