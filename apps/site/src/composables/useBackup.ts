import { ref } from 'vue';
import {
    buildBackupData,
    downloadJsonBackup,
    parseBackupJson,
    restoreBackup,
    type HyChunkBackup
} from '../lib/backup';
import { useGoogleDrive } from './useGoogleDrive';
import { usePlaces } from './usePlaces';
import { useSession } from './useSession';
import { useToast } from './useToast';
import { t } from '../lib/i18n';

const visible = ref(false);

export function useBackup() {
    const session = useSession();
    const places = usePlaces();
    const drive = useGoogleDrive();
    const toast = useToast();

    function getCurrentWorldBackupInfo() {
        const currentWorld = session.world.value;
        const key = currentWorld?.cacheKey ?? currentWorld?.id ?? '';
        return {
            id: key,
            name: currentWorld?.name,
            seed: currentWorld?.config.seed,
            completed: [...places.completed.value]
        };
    }

    function createBackup(): HyChunkBackup {
        return buildBackupData(getCurrentWorldBackupInfo());
    }

    function exportJsonFile() {
        try {
            const data = createBackup();
            downloadJsonBackup(data);
            toast.show(t('Backup file exported successfully'), 3000);
        } catch (e) {
            toast.show(e instanceof Error ? e.message : String(e), 4000);
        }
    }

    async function copyJsonToClipboard() {
        try {
            const data = createBackup();
            const text = JSON.stringify(data, null, 2);
            await navigator.clipboard.writeText(text);
            toast.show(t('JSON copied to clipboard'), 3000);
        } catch (e) {
            toast.show(e instanceof Error ? e.message : String(e), 4000);
        }
    }

    async function importJsonFile(file: File) {
        try {
            const text = await file.text();
            const backup = parseBackupJson(text);
            const { restoredWorlds, restoredPlaces } = restoreBackup(backup, true);
            places.reloadCompleted();
            toast.show(
                t('Backup restored successfully: {n} places across {w} worlds', {
                    n: restoredPlaces,
                    w: restoredWorlds
                }),
                4000
            );
        } catch (e) {
            toast.show(t('Failed to import backup: {err}', { err: e instanceof Error ? e.message : String(e) }), 5000);
        }
    }

    async function saveToGoogleDrive() {
        try {
            const data = createBackup();
            const text = JSON.stringify(data, null, 2);
            const result = await drive.saveToDrive(text);
            toast.show(t('Backup saved to Google Drive successfully!'), 4000);
            return result;
        } catch (e) {
            toast.show(t('Google Drive error: {err}', { err: e instanceof Error ? e.message : String(e) }), 5000);
            throw e;
        }
    }

    async function loadFromGoogleDrive() {
        try {
            const text = await drive.loadFromDrive();
            const backup = parseBackupJson(text);
            const { restoredWorlds, restoredPlaces } = restoreBackup(backup, true);
            places.reloadCompleted();
            toast.show(
                t('Backup restored from Google Drive: {n} places across {w} worlds', {
                    n: restoredPlaces,
                    w: restoredWorlds
                }),
                4000
            );
        } catch (e) {
            toast.show(t('Google Drive error: {err}', { err: e instanceof Error ? e.message : String(e) }), 5000);
            throw e;
        }
    }

    return {
        visible,
        open: () => (visible.value = true),
        close: () => (visible.value = false),
        createBackup,
        exportJsonFile,
        copyJsonToClipboard,
        importJsonFile,
        saveToGoogleDrive,
        loadFromGoogleDrive,
        drive
    };
}
