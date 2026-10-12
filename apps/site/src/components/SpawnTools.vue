<script setup lang="ts">
import { AutoComplete } from '@vitral/vue';
import { useSpawnTools } from '../composables/useSpawnTools';
import { t } from '../lib/i18n';

const tools = useSpawnTools();
</script>

<template>
    <details>
        <summary>{{ t('Tools: mobs and biomes') }}</summary>

        <div class="field">
            <span class="eyebrow">{{ t('Where a mob lives') }}</span>
            <AutoComplete
                v-model="tools.mobQuery.value"
                :suggestions="tools.mobSuggestions.value"
                size="small"
                :placeholder="t('Mob name')"
                fluid
                dropdown
                completeOnFocus
                :minLength="0"
                appendTo="body"
                showClear
                @complete="tools.completeMob"
                @option-select="tools.showMob($event.value)"
                @clear="tools.clearMob"
                @keydown.enter.prevent="tools.showMob()"
            />
            <small v-if="tools.mobShown.value" class="muted">{{
                t('Orange areas: {name}', { name: tools.mobShown.value.replace(/_/g, ' ') })
            }}</small>
        </div>

        <div class="field">
            <span class="eyebrow">{{ t('Highlight a biome') }}</span>
            <AutoComplete
                v-model="tools.biomeQuery.value"
                :suggestions="tools.biomeSuggestions.value"
                size="small"
                :placeholder="t('Biome name')"
                fluid
                dropdown
                completeOnFocus
                :minLength="0"
                appendTo="body"
                showClear
                @complete="tools.completeBiome"
                @option-select="tools.showBiome($event.value)"
                @clear="tools.clearBiome"
                @keydown.enter.prevent="tools.showBiome()"
            />
            <small v-if="tools.biomeShown.value" class="muted">{{
                t('Pink areas: {name}', { name: tools.biomeShown.value })
            }}</small>
        </div>
    </details>
</template>

<style scoped>
details {
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
}
summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 12px;
}
details[open] summary {
    margin-bottom: 8px;
}
.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
}
.field:last-child {
    margin-bottom: 4px;
}
</style>
