<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Button } from '@vitral/vue';
import { useCacheWarning } from '../composables/useCacheWarning';
import { t } from '../lib/i18n';

const warning = useCacheWarning();
onMounted(warning.start);

const size = computed(() => {
    const mb = warning.used.value / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
});
</script>

<template>
    <aside v-if="warning.visible.value" class="warning" role="alert">
        <p>
            <strong>{{ t('The saved map data is large ({size})', { size }) }}</strong>
            {{ t('The map can get slow or freeze. Clearing it is safe: it is made again as you explore.') }}
        </p>
        <div class="actions">
            <Button :label="t('Clear cache')" size="small" @click="warning.clear()" />
            <Button
                :label="t('Not now')"
                size="small"
                variant="outlined"
                severity="secondary"
                @click="warning.snooze()"
            />
            <Button
                :label="t('Do not warn again')"
                size="small"
                variant="text"
                severity="secondary"
                @click="warning.ignore()"
            />
        </div>
    </aside>
</template>

<style scoped>
.warning {
    position: fixed;
    right: 14px;
    top: 64px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(360px, calc(100vw - 28px));
    padding: 12px 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    font-size: 12.5px;
}
p {
    margin: 0;
    color: var(--muted);
}
strong {
    display: block;
    margin-bottom: 2px;
    color: var(--text);
}
.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
</style>
