<script setup lang="ts">
import { Button, Icon } from '@vitral/vue';
import { check, cloud, folderOpen, sparkles } from '@vitral/icons';
import { useSession } from '../composables/useSession';
import { useUpload } from '../composables/useUpload';
import { useBackup } from '../composables/useBackup';
import { t, tn } from '../lib/i18n';

const session = useSession();
const upload = useUpload();
const backup = useBackup();

const isCurrent = (id: string) => !session.isSeedWorld.value && session.world.value?.id === id;
</script>

<template>
    <div class="world-panel">
        <section class="current" data-tour="world-current">
            <span class="eyebrow">{{ t('Current world') }}</span>
            <strong>{{ session.isSeedWorld.value ? t('Seed map') : session.world.value?.name }}</strong>
            <span class="muted small">
                {{
                    session.isSeedWorld.value
                        ? t('Seed {seed}', { seed: session.seedText.value })
                        : tn(session.world.value?.regions.length ?? 0, '{n} region', '{n} regions')
                }}
            </span>
        </section>

        <div class="buttons" data-tour="world-buttons">
            <Button :icon="folderOpen" :label="t('Open a saved world')" size="small" fluid @click="upload.open" />
            <Button
                :icon="sparkles"
                :label="t('New seed map')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="session.rollSeed()"
            />
            <Button
                :icon="cloud"
                :label="t('Backup & Google Drive')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="backup.open()"
            />
        </div>

        <section v-if="session.worlds.value.length" data-tour="world-list">
            <h3 class="eyebrow">{{ t('Worlds in the opened folder') }}</h3>
            <ul>
                <li v-for="w in session.worlds.value" :key="w.id">
                    <button
                        :class="{ current: isCurrent(w.id) }"
                        :disabled="!w.regions || session.busy.value"
                        @click="session.openPickedWorld(w.id)"
                    >
                        <Icon :icon="isCurrent(w.id) ? check : folderOpen" :size="16" />
                        <span class="name">{{ w.name }}</span>
                        <span class="muted small">{{
                            w.source === 'universe' ? tn(w.regions, '{n} region', '{n} regions') : w.source
                        }}</span>
                    </button>
                </li>
            </ul>
        </section>
    </div>
</template>

<style scoped>
.world-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}
.current {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border: 1px solid var(--accent-line);
    border-radius: var(--radius);
    background: var(--accent-soft);
}
.current strong {
    font-size: 15px;
    overflow-wrap: anywhere;
}
.buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
h3 {
    margin: 0 0 8px;
}
ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}
li button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    text-align: left;
}
li button:hover:not(:disabled) {
    border-color: var(--accent-line);
}
li button.current {
    border-color: var(--accent-line);
    color: var(--accent);
}
li button:disabled {
    opacity: 0.45;
    cursor: default;
}
.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
