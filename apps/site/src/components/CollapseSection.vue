<script setup lang="ts">
import { ref, watch } from 'vue';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';

/** A section that folds away to give the list room; it remembers whether it was open. */
const props = withDefaults(defineProps<{ id: string; title: string; count?: number; open?: boolean }>(), {
    open: true
});

const stored = readStorage(STORAGE_KEYS.section(props.id));
const isOpen = ref(stored === null ? props.open : stored === '1');
watch(isOpen, (v) => writeStorage(STORAGE_KEYS.section(props.id), v ? '1' : '0'));
</script>

<template>
    <details class="section" :open="isOpen" @toggle="isOpen = ($event.target as HTMLDetailsElement).open">
        <summary>
            <span class="title">{{ title }}</span>
            <b v-if="count !== undefined" class="count">{{ count }}</b>
            <span class="peek"><slot name="peek" /></span>
        </summary>
        <div class="body"><slot /></div>
    </details>
</template>

<style scoped>
.section {
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
}
summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    list-style: none;
}
summary::-webkit-details-marker {
    display: none;
}
summary::before {
    content: '▸';
    font-size: 10px;
    transition: transform 0.12s;
}
.section[open] summary::before {
    transform: rotate(90deg);
}
.section[open] summary {
    color: var(--text);
}
.title {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
}
.count {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
.peek {
    display: flex;
    margin-left: auto;
}
.section[open] .peek {
    display: none;
}
.body {
    padding: 2px 8px 8px;
}
</style>
