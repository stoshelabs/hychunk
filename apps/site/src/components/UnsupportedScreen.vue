<script setup lang="ts">
import { Icon } from '@vitral/vue';
import { warning as warningIcon } from '@vitral/icons';
import { LOGO_URL } from '../lib/assets';
import { t } from '../lib/i18n';
</script>

<template>
    <div class="unsupported-screen">
        <div class="card">
            <div class="header">
                <img :src="LOGO_URL" alt="HyChunk" width="44" height="44" />
                <span class="brand-title">HyChunk</span>
            </div>

            <div class="badge">
                <Icon :icon="warningIcon" :size="20" class="warn-icon" />
                <h1>{{ t('Unsupported browser or device') }}</h1>
            </div>

            <p class="description">
                {{
                    t(
                        'Your browser or device does not support the modern Web APIs required to run the map (such as DecompressionStream and Web Workers). Please update your browser or use a newer device.'
                    )
                }}
            </p>

            <div class="requirements">
                <span class="req-title">{{ t('Supported platforms:') }}</span>
                <ul>
                    <li>Chrome 80+</li>
                    <li>Firefox 113+</li>
                    <li>Safari / iOS 16.4+</li>
                    <li>Microsoft Edge</li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
.unsupported-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 20px;
    background: var(--bg, #0b0e14);
    color: var(--text, #f1f5f9);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-sizing: border-box;
}

.card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 480px;
    width: 100%;
    padding: 36px 28px;
    background: var(--surface, #141923);
    border: 1px solid var(--line, rgba(255, 255, 255, 0.08));
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
}

.brand-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.badge {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    padding: 8px 16px;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 9999px;
}

.badge h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #fbbf24;
}

.warn-icon {
    color: #f59e0b;
    flex-shrink: 0;
}

.description {
    margin: 0 0 24px 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--muted, #94a3b8);
}

.requirements {
    width: 100%;
    padding: 16px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 13px;
    text-align: left;
    box-sizing: border-box;
}

.req-title {
    display: block;
    font-weight: 600;
    color: var(--text, #e2e8f0);
    margin-bottom: 8px;
}

.requirements ul {
    margin: 0;
    padding-left: 20px;
    color: var(--muted, #94a3b8);
    line-height: 1.5;
}
</style>
