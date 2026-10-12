import { t } from '../lib/i18n';
import { useToast } from './useToast';

/** Copies text to the clipboard and says so; when the browser refuses, the text is shown to be copied by hand. */
async function copy(text: string, done: string) {
    const toast = useToast();
    try {
        await navigator.clipboard.writeText(text);
        toast.show(done);
    } catch {
        window.prompt(t('Copy this:'), text);
    }
}

export function useShare() {
    return {
        copyTeleport: (x: number, y: number, z: number) => {
            const command = `/tp ${Math.round(x)} ${Math.round(y)} ${Math.round(z)}`;
            return copy(command, t('Copied {text}', { text: command }));
        },
        copyCoordinates: (x: number, z: number) => copy(`${x}, ${z}`, t('Coordinates copied')),
        copyLink: () => copy(location.href, t('Link copied'))
    };
}
