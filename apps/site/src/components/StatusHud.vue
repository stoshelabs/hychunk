<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@vitral/vue';
import { refresh } from '@vitral/icons';
import { useSession } from '../composables/useSession';
import { t, tn } from '../lib/i18n';

const session = useSession();
const visible = computed(() => !!(session.hover.value || session.pending.value || session.measuring.value));
</script>

<template>
    <div v-if="visible" class="hud" role="status">
        <span v-if="session.measuring.value">{{ session.measureText.value || t('Click two points to measure') }}</span>
        <span v-if="session.hover.value">
            X {{ session.hover.value.x }} · Z {{ session.hover.value.z }} · {{ t('Chunk') }} [{{
                session.hover.value.chunkX
            }}, {{ session.hover.value.chunkZ }}]
        </span>
        <span v-if="session.pending.value" class="loading">
            <Icon :icon="refresh" spin :size="13" />
            {{ tn(session.pending.value, 'Drawing {n} chunk', 'Drawing {n} chunks') }}
        </span>
    </div>
</template>

<style scoped>
.hud {
    position: absolute;
    left: 14px;
    bottom: calc(14px + env(safe-area-inset-bottom));
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100% - 28px);
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: rgba(17, 22, 31, 0.92);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    backdrop-filter: blur(8px);
    pointer-events: none;
}
.loading {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
}

@media (max-width: 768px) {
    .hud {
        flex-wrap: wrap;
        gap: 4px 10px;
    }
}
</style>
