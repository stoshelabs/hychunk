import { ref } from 'vue';

export interface CompatibilityIssue {
    key: string;
    feature: string;
    detail: string;
}

function detectIssues(): CompatibilityIssue[] {
    if (typeof window === 'undefined') return [];
    const issues: CompatibilityIssue[] = [];

    // Check DecompressionStream (added in iOS 16.4 / Safari 16.4 / Chrome 80 / Firefox 113)
    if (typeof DecompressionStream === 'undefined') {
        issues.push({
            key: 'decompression',
            feature: 'DecompressionStream',
            detail: 'Requires iOS 16.4+ or a modern browser to decompress world data.'
        });
    }

    // Check Web Worker support
    if (typeof Worker === 'undefined') {
        issues.push({
            key: 'worker',
            feature: 'Web Workers',
            detail: 'Requires Web Workers for background chunk generation.'
        });
    }

    // Check BigInt support
    if (typeof BigInt === 'undefined') {
        issues.push({
            key: 'bigint',
            feature: 'BigInt',
            detail: 'Requires BigInt support for 64-bit world seeds.'
        });
    }

    return issues;
}

const issues = ref<CompatibilityIssue[]>(detectIssues());
const dismissed = ref(false);

export function isHighPerformanceDevice(): boolean {
    if (typeof navigator === 'undefined') return true;

    // Check logical cores: 8 or more cores is standard for capable desktop/laptops
    const cores = navigator.hardwareConcurrency || 4;

    // Check device memory (Chromium API, in GiB)
    const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof memory === 'number' && memory < 6) {
        return false;
    }

    // Mobile phones and smaller portable touch devices have thermal limits and smaller batteries
    const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' &&
            ('ontouchstart' in window || navigator.maxTouchPoints > 1) &&
            Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight) < 768);

    if (isMobile) {
        return false;
    }

    return cores >= 8;
}

export function useCompatibility() {
    return {
        isSupported: issues.value.length === 0,
        issues,
        dismissed,
        dismiss: () => {
            dismissed.value = true;
        }
    };
}
