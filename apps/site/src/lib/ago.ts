import { lang, languages } from './i18n';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60]
];

/** "2 hours ago" in the site's language; empty when the time is not known. */
export function ago(ms: number, now = Date.now()): string {
    if (!ms) return '';
    const seconds = Math.round((ms - now) / 1000);
    const format = new Intl.RelativeTimeFormat(languages[lang.value].tag, { numeric: 'auto' });
    for (const [unit, size] of UNITS)
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    return format.format(0, 'minute');
}
