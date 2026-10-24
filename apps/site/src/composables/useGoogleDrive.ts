import { ref } from 'vue';
import { readStorage, STORAGE_KEYS, writeStorage } from '../lib/storage';

const DRIVE_FILE_NAME = 'hychunk-backup.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initTokenClient: (config: {
                        client_id: string;
                        scope: string;
                        callback: (response: GoogleTokenResponse) => void;
                        error_callback?: (err: unknown) => void;
                    }) => GoogleTokenClient;
                    revoke: (token: string, done?: () => void) => void;
                };
            };
        };
    }
}

interface GoogleTokenResponse {
    access_token?: string;
    error?: string;
    expires_in?: number;
}

interface GoogleTokenClient {
    requestAccessToken: (options?: { prompt?: string }) => void;
}

const DEFAULT_CLIENT_ID = '335185193628-plq04qlt77hmohkts7h51qktug4dq9a9.apps.googleusercontent.com';

const clientId = ref<string>(
    readStorage(STORAGE_KEYS.googleClientId) || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || DEFAULT_CLIENT_ID
);
const accessToken = ref<string | null>(null);
const isSignedIn = ref(false);
const isConnecting = ref(false);
const isSyncing = ref(false);
const error = ref<string>('');
const lastSync = ref<string | null>(readStorage(STORAGE_KEYS.googleLastSync));
const fileId = ref<string | null>(readStorage(STORAGE_KEYS.googleDriveFileId));
const fileLink = ref<string | null>(null);

let tokenClient: GoogleTokenClient | null = null;
let scriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Identity Services library.'));
        document.head.appendChild(script);
    });
    return scriptPromise;
}

export function useGoogleDrive() {
    function setClientId(id: string) {
        clientId.value = id.trim();
        writeStorage(STORAGE_KEYS.googleClientId, clientId.value);
        tokenClient = null; // reset client to re-init with new ID
    }

    async function initClient(): Promise<boolean> {
        error.value = '';
        if (!clientId.value) {
            error.value = 'Google Client ID is not configured.';
            return false;
        }

        try {
            await loadGsiScript();
            if (!window.google?.accounts?.oauth2) {
                error.value = 'Google Identity Services could not be loaded.';
                return false;
            }

            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId.value,
                scope: DRIVE_SCOPE,
                callback: (resp: GoogleTokenResponse) => {
                    isConnecting.value = false;
                    if (resp.error) {
                        error.value = resp.error;
                        isSignedIn.value = false;
                        accessToken.value = null;
                        return;
                    }
                    if (resp.access_token) {
                        accessToken.value = resp.access_token;
                        isSignedIn.value = true;
                        error.value = '';
                    }
                },
                error_callback: (err: unknown) => {
                    isConnecting.value = false;
                    error.value = err instanceof Error ? err.message : String(err);
                }
            });
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            return false;
        }
    }

    async function signIn(): Promise<void> {
        isConnecting.value = true;
        error.value = '';
        const ready = tokenClient || (await initClient());
        if (!ready || !tokenClient) {
            isConnecting.value = false;
            return;
        }
        tokenClient.requestAccessToken({ prompt: '' });
    }

    function signOut() {
        if (accessToken.value && window.google?.accounts?.oauth2?.revoke) {
            window.google.accounts.oauth2.revoke(accessToken.value);
        }
        accessToken.value = null;
        isSignedIn.value = false;
        error.value = '';
    }

    async function findBackupFile(token: string): Promise<{ id: string; webViewLink?: string } | null> {
        const query = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=1`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Google Drive API error (${res.status}): ${body}`);
        }
        const data = (await res.json()) as { files?: Array<{ id: string; webViewLink?: string }> };
        if (data.files && data.files.length > 0) {
            return data.files[0]!;
        }
        return null;
    }

    async function saveToDrive(jsonContent: string): Promise<{ fileId: string; webViewLink?: string }> {
        if (!accessToken.value) {
            throw new Error('Not connected to Google Drive. Please connect first.');
        }

        isSyncing.value = true;
        error.value = '';

        try {
            const token = accessToken.value;
            let targetFile: { id: string; webViewLink?: string } | null = fileId.value
                ? { id: fileId.value, webViewLink: fileLink.value ?? undefined }
                : null;

            if (!targetFile) {
                targetFile = await findBackupFile(token);
            }

            let resultId = '';
            let resultLink = '';

            if (targetFile?.id) {
                // Update existing file
                const updateRes = await fetch(
                    `https://www.googleapis.com/upload/drive/v3/files/${targetFile.id}?uploadType=media`,
                    {
                        method: 'PATCH',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: jsonContent
                    }
                );
                if (!updateRes.ok) {
                    throw new Error(`Failed to update backup file in Google Drive (${updateRes.status})`);
                }
                const updateData = (await updateRes.json()) as { id: string; webViewLink?: string };
                resultId = updateData.id;
                resultLink = updateData.webViewLink || targetFile.webViewLink || '';
            } else {
                // Create new file with multipart upload
                const boundary = '-------314159265358979323846';
                const delimiter = `\r\n--${boundary}\r\n`;
                const closeDelimiter = `\r\n--${boundary}--`;

                const metadata = {
                    name: DRIVE_FILE_NAME,
                    mimeType: 'application/json',
                    description: 'HyChunk World Map Backup (Seeds & Completed Places)'
                };

                const multipartRequestBody =
                    delimiter +
                    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                    JSON.stringify(metadata) +
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    jsonContent +
                    closeDelimiter;

                const createRes = await fetch(
                    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': `multipart/related; boundary=${boundary}`
                        },
                        body: multipartRequestBody
                    }
                );

                if (!createRes.ok) {
                    throw new Error(`Failed to create backup in Google Drive (${createRes.status})`);
                }
                const createData = (await createRes.json()) as { id: string; webViewLink?: string };
                resultId = createData.id;
                resultLink = createData.webViewLink || '';
            }

            fileId.value = resultId;
            writeStorage(STORAGE_KEYS.googleDriveFileId, resultId);
            if (resultLink) {
                fileLink.value = resultLink;
            }

            const now = new Date().toISOString();
            lastSync.value = now;
            writeStorage(STORAGE_KEYS.googleLastSync, now);

            return { fileId: resultId, webViewLink: resultLink || fileLink.value || undefined };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            error.value = msg;
            throw e;
        } finally {
            isSyncing.value = false;
        }
    }

    async function loadFromDrive(): Promise<string> {
        if (!accessToken.value) {
            throw new Error('Not connected to Google Drive. Please connect first.');
        }

        isSyncing.value = true;
        error.value = '';

        try {
            const token = accessToken.value;
            let target = fileId.value ? { id: fileId.value } : null;
            if (!target) {
                target = await findBackupFile(token);
            }
            if (!target) {
                throw new Error('No HyChunk backup file found in your Google Drive.');
            }

            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${target.id}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error(`Failed to download backup from Google Drive (${res.status})`);
            }

            const text = await res.text();
            fileId.value = target.id;
            writeStorage(STORAGE_KEYS.googleDriveFileId, target.id);

            const now = new Date().toISOString();
            lastSync.value = now;
            writeStorage(STORAGE_KEYS.googleLastSync, now);

            return text;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            error.value = msg;
            throw e;
        } finally {
            isSyncing.value = false;
        }
    }

    return {
        clientId,
        setClientId,
        isSignedIn,
        isConnecting,
        isSyncing,
        error,
        lastSync,
        fileId,
        fileLink,
        signIn,
        signOut,
        saveToDrive,
        loadFromDrive
    };
}
