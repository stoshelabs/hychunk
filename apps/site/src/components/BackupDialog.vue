<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Dialog, Icon, InputText } from '@vitral/vue';
import {
    check,
    close,
    cloud,
    copy,
    download,
    externalLink,
    fileJson,
    info,
    logIn,
    logOut,
    refresh,
    settings,
    upload
} from '@vitral/icons';
import { useBackup } from '../composables/useBackup';
import { usePlaces } from '../composables/usePlaces';
import { useSession } from '../composables/useSession';
import { t, tn } from '../lib/i18n';
import { ago } from '../lib/ago';

const backup = useBackup();
const session = useSession();
const places = usePlaces();
const drive = backup.drive;

const fileInput = ref<HTMLInputElement>();
const showConfig = ref(false);
const customClientId = ref(drive.clientId.value);

const currentSeed = computed(() => session.world.value?.config.seed !== undefined ? String(session.world.value.config.seed) : '');
const completedCount = computed(() => places.completed.value.size);
const summary = computed(() => backup.createBackup().summary);

function onPickFile(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        backup.importJsonFile(target.files[0]!);
        target.value = '';
    }
}

function saveClientId() {
    drive.setClientId(customClientId.value);
    showConfig.value = false;
}
</script>

<template>
    <Dialog
        v-model:visible="backup.visible.value"
        modal
        dismissableMask
        :header="t('Backup & Cloud (Google Drive)')"
        class="backup-dialog"
    >
        <div class="body">
            <!-- Current World & Summary Badge -->
            <section class="summary-card">
                <div class="info-row">
                    <Icon :icon="fileJson" :size="20" class="icon-accent" />
                    <div class="grow">
                        <strong>{{ session.isSeedWorld.value ? t('Seed {seed}', { seed: currentSeed }) : session.world.value?.name }}</strong>
                        <span class="muted small">
                            {{ tn(completedCount, '{n} place completed in this map', '{n} places completed in this map') }}
                        </span>
                    </div>
                    <span class="badge">{{ tn(summary.totalWorlds, '{n} world saved', '{n} worlds saved') }}</span>
                </div>
            </section>

            <!-- Google Drive Cloud Section -->
            <section class="drive-card">
                <div class="card-head">
                    <div class="card-title">
                        <Icon :icon="cloud" :size="18" class="icon-cloud" />
                        <strong>{{ t('Google Drive Cloud Sync') }}</strong>
                    </div>
                    <button
                        class="btn-icon"
                        :title="t('Configure Client ID')"
                        :aria-label="t('Configure Client ID')"
                        @click="showConfig = !showConfig"
                    >
                        <Icon :icon="settings" :size="16" />
                    </button>
                </div>

                <div v-if="showConfig" class="config-box">
                    <label class="eyebrow" for="client-id">{{ t('Google OAuth Client ID') }}</label>
                    <p class="muted small">
                        {{ t('Configure your Google OAuth Client ID to connect directly to your Google Drive account.') }}
                    </p>
                    <div class="config-row">
                        <InputText
                            id="client-id"
                            v-model="customClientId"
                            size="small"
                            placeholder="xxxxxx.apps.googleusercontent.com"
                            fluid
                        />
                        <Button :label="t('Save')" size="small" @click="saveClientId" />
                    </div>
                </div>

                <div v-if="!drive.isSignedIn.value" class="connect-prompt">
                    <p class="muted small">
                        {{ t('Connect your Google Drive to save and sync your completed seeds and maps in the cloud.') }}
                    </p>
                    <Button
                        :icon="logIn"
                        :label="drive.isConnecting.value ? t('Connecting...') : t('Connect Google Drive')"
                        :disabled="drive.isConnecting.value"
                        size="small"
                        class="btn-connect"
                        @click="drive.signIn"
                    />
                </div>

                <div v-else class="connected-box">
                    <div class="status-row">
                        <span class="status-badge">
                            <Icon :icon="check" :size="14" />
                            {{ t('Connected to Google Drive') }}
                        </span>
                        <button class="link-btn small" @click="drive.signOut">
                            <Icon :icon="logOut" :size="13" />
                            {{ t('Disconnect') }}
                        </button>
                    </div>

                    <div v-if="drive.lastSync.value" class="sync-info small muted">
                        {{ t('Last synced: {time}', { time: ago(new Date(drive.lastSync.value).getTime()) }) }}
                    </div>

                    <div class="drive-actions">
                        <Button
                            :icon="cloud"
                            :label="t('Save to Google Drive')"
                            :loading="drive.isSyncing.value"
                            size="small"
                            class="action-btn"
                            @click="backup.saveToGoogleDrive"
                        />
                        <Button
                            :icon="refresh"
                            :label="t('Restore from Google Drive')"
                            :loading="drive.isSyncing.value"
                            size="small"
                            variant="outlined"
                            severity="secondary"
                            class="action-btn"
                            @click="backup.loadFromGoogleDrive"
                        />
                    </div>

                    <a
                        v-if="drive.fileLink.value"
                        :href="drive.fileLink.value"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="drive-link small"
                    >
                        <Icon :icon="externalLink" :size="13" />
                        {{ t('Open backup in Google Drive') }}
                    </a>
                </div>

                <p v-if="drive.error.value" class="error-msg small" role="alert">
                    {{ drive.error.value }}
                </p>
            </section>

            <!-- JSON Local File Backup Section -->
            <section class="json-card">
                <span class="eyebrow">{{ t('JSON File Backup') }}</span>
                <p class="muted small">
                    {{ t('Download or restore your backup as a JSON file, or copy it to link with your apps.') }}
                </p>

                <div class="json-actions">
                    <Button
                        :icon="download"
                        :label="t('Download JSON')"
                        size="small"
                        variant="outlined"
                        severity="secondary"
                        class="json-btn"
                        @click="backup.exportJsonFile"
                    />
                    <Button
                        :icon="upload"
                        :label="t('Restore JSON')"
                        size="small"
                        variant="outlined"
                        severity="secondary"
                        class="json-btn"
                        @click="fileInput?.click()"
                    />
                    <Button
                        :icon="copy"
                        :label="t('Copy JSON')"
                        size="small"
                        variant="outlined"
                        severity="secondary"
                        class="json-btn"
                        @click="backup.copyJsonToClipboard"
                    />
                </div>
                <input
                    ref="fileInput"
                    type="file"
                    accept=".json,application/json"
                    hidden
                    @change="onPickFile"
                />
            </section>
        </div>
    </Dialog>
</template>

<style scoped>
.body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(480px, 100vw - 48px);
    padding-top: 4px;
}
.summary-card {
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
}
.info-row {
    display: flex;
    align-items: center;
    gap: 12px;
}
.icon-accent {
    color: var(--accent);
}
.icon-cloud {
    color: #38bdf8;
}
.badge {
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    color: var(--muted);
}
.drive-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
}
.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.card-title {
    display: flex;
    align-items: center;
    gap: 8px;
}
.btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--muted);
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
}
.btn-icon:hover {
    color: var(--text);
    background: var(--line);
}
.config-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
}
.config-row {
    display: flex;
    gap: 8px;
}
.connect-prompt {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.btn-connect {
    align-self: flex-start;
}
.connected-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #4ade80;
    font-size: 13px;
    font-weight: 600;
}
.link-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
}
.link-btn:hover {
    color: #f87171;
}
.sync-info {
    font-size: 12px;
}
.drive-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.drive-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
    text-decoration: none;
    margin-top: 2px;
}
.drive-link:hover {
    text-decoration: underline;
}
.error-msg {
    color: #f87171;
    background: #f871711a;
    padding: 8px 10px;
    border-radius: 6px;
    margin: 0;
}
.json-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
}
.json-actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
}
@media (max-width: 480px) {
    .drive-actions,
    .json-actions {
        grid-template-columns: 1fr;
    }
}
</style>
