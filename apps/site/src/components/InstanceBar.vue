<script setup lang="ts">
import { Button } from '@vitral/vue';
import { arrowLeft } from '@vitral/icons';
import { useSession } from '../composables/useSession';
import { t } from '../lib/i18n';

const session = useSession();
</script>

<template>
    <div v-if="session.inInstance.value && session.world.value" class="bar" role="status">
        <span class="text">
            <span class="eyebrow">{{ t('Instance') }}</span>
            <strong>{{ session.world.value.name }}</strong>
        </span>
        <Button
            v-if="session.origin.value"
            :icon="arrowLeft"
            :label="t('Back to {world}', { world: session.origin.value.world.name })"
            size="small"
            @click="session.leaveInstance()"
        />
    </div>
</template>

<style scoped>
.bar {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100% - 28px);
    padding: 6px 8px 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    transform: translateX(-50%);
}
.text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 13px;
}
.text strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
