<script setup lang="ts">
import { Button } from '@vitral/vue';
import { fileText, info, shield } from '@vitral/icons';
import { usePage } from '../composables/usePage';
import { t } from '../lib/i18n';
import LegalNotice from './LegalNotice.vue';

const route = usePage();
</script>

<template>
    <div class="legal-panel">
        <div class="buttons" data-tour="legal-links">
            <Button
                :icon="info"
                :label="t('About HyChunk')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="route.open('about')"
            />
            <Button
                :icon="fileText"
                :label="t('Terms of Use')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="route.open('terms')"
            />
            <Button
                :icon="shield"
                :label="t('Privacy Policy')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="route.open('privacy')"
            />
        </div>
        <LegalNotice class="notice" :links="false" />
    </div>
</template>

<style scoped>
.legal-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}
.buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.notice {
    text-align: left;
}
</style>
