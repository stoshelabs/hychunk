import { computed, ref } from 'vue';
import { listWorlds, type WorldEntry } from '@hychunk/core';
import { filesFromDrop } from '../lib/dropFolder';
import { messageOf } from '../lib/errors';
import { t } from '../lib/i18n';
import { useSession } from './useSession';

type Stage = 'idle' | 'reading' | 'choose' | 'error';

const visible = ref(false);
const stage = ref<Stage>('idle');
const dragging = ref(false);
const fileCount = ref(0);
const found = ref<WorldEntry[]>([]);
const choice = ref('');
const error = ref('');

let files: File[] = [];

const session = useSession();

function reset() {
    stage.value = 'idle';
    fileCount.value = 0;
    found.value = [];
    choice.value = '';
    error.value = '';
    files = [];
}

function open() {
    reset();
    visible.value = true;
}

/** Looks for worlds in what was picked or dropped; one with chunks is preselected, `default` first. */
function accept(list: File[]) {
    files = list;
    fileCount.value = list.length;
    found.value = listWorlds(list);
    const best = found.value.find((w) => w.name === 'default' && w.regions) ?? found.value.find((w) => w.regions);
    if (!best) {
        error.value = t(
            'No world found. A world folder holds a config.json and a chunks folder, usually universe/worlds/<name>.'
        );
        stage.value = 'error';
        return;
    }
    choice.value = best.id;
    stage.value = 'choose';
}

async function read(task: () => Promise<File[]>) {
    stage.value = 'reading';
    fileCount.value = 0;
    try {
        accept(await task());
    } catch (e) {
        error.value = messageOf(e);
        stage.value = 'error';
    }
}

const pick = (input: HTMLInputElement) => read(async () => [...(input.files ?? [])]);

function drop(e: DragEvent) {
    dragging.value = false;
    if (e.dataTransfer) void read(() => filesFromDrop(e.dataTransfer!, (n) => (fileCount.value = n)));
}

async function confirm() {
    await session.openFiles(files, choice.value);
    if (!session.error.value) visible.value = false;
    else {
        error.value = session.error.value;
        stage.value = 'error';
    }
}

export function useUpload() {
    return {
        visible,
        stage,
        dragging,
        fileCount,
        found,
        choice,
        error,
        canOpen: computed(() => stage.value === 'choose' && !!choice.value),
        open,
        reset,
        pick,
        drop,
        confirm
    };
}
