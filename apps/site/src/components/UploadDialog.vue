<script setup lang="ts">
import { ref } from 'vue';
import { Button, Dialog, Icon } from '@vitral/vue';
import { check, folderOpen } from '@vitral/icons';
import { useUpload } from '../composables/useUpload';
import { t, tn } from '../lib/i18n';

const upload = useUpload();
const input = ref<HTMLInputElement>();

const hasWorlds = () => upload.found.value.length > 0;
</script>

<template>
    <Dialog
        v-model:visible="upload.visible.value"
        modal
        dismissableMask
        :header="t('Open a saved world')"
        class="upload"
    >
        <div class="body">
            <div
                class="drop"
                :class="{ over: upload.dragging.value }"
                @dragenter.prevent="upload.dragging.value = true"
                @dragover.prevent="upload.dragging.value = true"
                @dragleave.prevent="upload.dragging.value = false"
                @drop.prevent="upload.drop"
            >
                <Icon :icon="folderOpen" :size="28" />
                <template v-if="upload.stage.value === 'reading'">
                    <strong>{{ t('Reading files...') }}</strong>
                    <span class="muted small">{{
                        tn(upload.fileCount.value, '{n} file found', '{n} files found')
                    }}</span>
                </template>
                <template v-else>
                    <strong>{{ t('Drop the world or server folder here') }}</strong>
                    <span class="muted small">{{ t('or') }}</span>
                    <Button
                        :label="t('Choose folder')"
                        size="small"
                        variant="outlined"
                        severity="secondary"
                        @click="input?.click()"
                    />
                </template>
                <input
                    ref="input"
                    type="file"
                    webkitdirectory
                    multiple
                    hidden
                    @change="upload.pick($event.target as HTMLInputElement)"
                />
            </div>

            <p v-if="upload.stage.value === 'error'" class="error" role="alert">{{ upload.error.value }}</p>

            <fieldset v-if="upload.stage.value === 'choose' && hasWorlds()">
                <legend class="eyebrow">{{ t('Worlds found') }}</legend>
                <label v-for="w in upload.found.value" :key="w.id" :class="{ disabled: !w.regions }">
                    <input
                        v-model="upload.choice.value"
                        type="radio"
                        name="world"
                        :value="w.id"
                        :disabled="!w.regions"
                    />
                    <span class="name">{{ w.name }}</span>
                    <span class="muted small">{{
                        w.source === 'universe' ? t('Server world') : t('Plugin: {name}', { name: w.source })
                    }}</span>
                    <span class="muted small count">{{ tn(w.regions, '{n} region', '{n} regions') }}</span>
                </label>
            </fieldset>

            <ul class="help muted small">
                <li>{{ t('Saves live in the server folder, under universe/worlds/your-world.') }}</li>
                <li>
                    {{ t('Picking the whole server folder works too: every world and plugin world inside is listed.') }}
                </li>
                <li>{{ t('Everything is read in your browser. Nothing is uploaded.') }}</li>
            </ul>
        </div>

        <template #footer>
            <Button
                :label="t('Cancel')"
                variant="text"
                severity="secondary"
                size="small"
                @click="upload.visible.value = false"
            />
            <Button
                :icon="check"
                :label="t('Open world')"
                size="small"
                :disabled="!upload.canOpen.value"
                @click="upload.confirm"
            />
        </template>
    </Dialog>
</template>

<style scoped>
.body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(520px, calc(100vw - 48px));
}
.drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 16px;
    border: 2px dashed var(--line-strong);
    border-radius: 14px;
    background: var(--surface-2);
    color: var(--muted);
    text-align: center;
    transition:
        border-color 0.15s,
        background 0.15s;
}
.drop strong {
    color: var(--text);
}
.drop.over {
    border-color: var(--accent);
    background: var(--accent-soft);
}
.error {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(248, 113, 113, 0.12);
    color: #f87171;
    font-size: 13px;
}
fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
}
legend {
    margin-bottom: 6px;
    padding: 0;
}
fieldset label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    cursor: pointer;
}
fieldset label:hover:not(.disabled) {
    border-color: var(--accent-line);
}
fieldset label.disabled {
    opacity: 0.45;
    cursor: default;
}
.name {
    font-weight: 600;
}
.count {
    margin-left: auto;
}
.help {
    margin: 0;
    padding-left: 18px;
}
</style>
