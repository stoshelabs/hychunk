<script setup lang="ts">
import { computed, ref } from 'vue';
import { playerColor, type PlayerPosition } from '@hychunk/core';

/** A player's face from the skin service (by id, then by name) in a ring of their colour; the first letter when there is none. */
const props = withDefaults(defineProps<{ player: PlayerPosition; size?: number }>(), { size: 32 });

const SKIN_API = 'https://api.hytl.skin/headshot';
const ALLOWED_SIZES = [64, 96, 128, 256, 512, 1024, 2048];
const targetSize = props.size * 2;
const querySize = ALLOWED_SIZES.find((s) => s >= targetSize) ?? 64;

const tries = computed(() => [props.player.uuid, props.player.name].filter((v): v is string => !!v));
const attempt = ref(0);
const failed = computed(() => attempt.value >= tries.value.length);
const src = computed(() =>
    failed.value ? '' : `${SKIN_API}/${encodeURIComponent(tries.value[attempt.value]!)}?size=${querySize}`
);
const color = computed(() => playerColor(props.player));
</script>

<template>
    <span class="face" :style="{ '--ring': color, width: `${size}px`, height: `${size}px` }">
        <img v-if="!failed" :src="src" alt="" crossorigin="anonymous" @error="attempt++" />
        <i v-else>{{ player.name.slice(0, 1).toUpperCase() }}</i>
    </span>
</template>

<style scoped>
.face {
    display: inline-grid;
    flex: none;
    place-items: center;
    overflow: hidden;
    border: 2px solid var(--ring);
    border-radius: 50%;
    background: var(--surface);
}
img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
}
i {
    color: var(--ring);
    font-size: 13px;
    font-style: normal;
    font-weight: 700;
}
</style>
