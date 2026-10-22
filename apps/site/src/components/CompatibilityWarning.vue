<script setup lang="ts">
import { Icon, Button } from '@vitral/vue';
import { warning as warningIcon, close } from '@vitral/icons';
import { useCompatibility } from '../composables/useCompatibility';
import { t } from '../lib/i18n';

const compat = useCompatibility();
</script>

<template>
    <aside v-if="!compat.isSupported && !compat.dismissed.value" class="compat-warning" role="alert">
        <div class="content">
            <Icon :icon="warningIcon" :size="20" class="icon" />
            <div class="message">
                <strong>{{ t('Unsupported browser or device') }}</strong>
                <p>
                    {{
                        t(
                            'Your browser or device does not support the modern Web APIs required to run the map (such as DecompressionStream and Web Workers). Please update your browser or use a newer device.'
                        )
                    }}
                </p>
            </div>
        </div>
        <button class="close-btn" :aria-label="t('Close')" @click="compat.dismiss()">
            <Icon :icon="close" :size="14" />
        </button>
    </aside>
</template>

<style scoped>
.compat-warning {
    position: fixed;
    top: calc(var(--header-height) + 12px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    width: min(560px, calc(100vw - 28px));
    padding: 14px 16px;
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 12px;
    background: rgba(30, 22, 12, 0.96);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    font-size: 13px;
    line-height: 1.5;
}
.content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}
.icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: #f59e0b;
}
.message strong {
    display: block;
    margin-bottom: 3px;
    color: #fbbf24;
    font-size: 13.5px;
}
.message p {
    margin: 0;
    color: #fef3c7;
    opacity: 0.9;
}
.close-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-top: -2px;
    margin-right: -4px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #fde68a;
    cursor: pointer;
    transition: background-color 0.15s;
}
.close-btn:hover {
    background: rgba(245, 158, 11, 0.2);
}
</style>
