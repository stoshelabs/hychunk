<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Checkbox, HoverCard, Icon, InputText, ToggleSwitch } from '@vitral/vue';
import { copy, dices, download, layers as layersIcon, mountain, trash } from '@vitral/icons';
import { describeGenerator } from '@hychunk/core';
import { useSession } from '../composables/useSession';
import { useShare } from '../composables/useShare';
import { t } from '../lib/i18n';

const LAYERS = [
    { key: 'chunkGrid', label: 'Chunk grid' },
    { key: 'regionGrid', label: 'Region grid' },
    { key: 'spawn', label: 'Spawn icon' },
    { key: 'markers', label: 'Markers on the map' },
    { key: 'players', label: 'Players' },
    { key: 'playerSkins', label: 'Player faces (api.hytl.skin)' }
] as const;

const session = useSession();
const share = useShare();

const coordinates = ref('');
const coordinatesInvalid = ref(false);
const cacheCleared = ref(false);
const generator = computed(() => (session.world.value ? describeGenerator(session.world.value.config) : null));

function go() {
    coordinatesInvalid.value = !session.goToText(coordinates.value);
}

async function forgetCache() {
    await session.clearCache();
    cacheCleared.value = true;
}
</script>

<template>
    <div v-if="session.world.value" class="map-panel">
        <section class="card">
            <label class="eyebrow" for="seed">{{ t('World seed') }}</label>
            <div class="row">
                <InputText
                    id="seed"
                    v-model="session.seedText.value"
                    size="small"
                    :placeholder="t('Enter a seed...')"
                    fluid
                    @change="session.applySeed()"
                    @keydown.enter.prevent="session.applySeed()"
                />
                <Button
                    :icon="dices"
                    variant="outlined"
                    severity="secondary"
                    size="small"
                    :aria-label="t('Random seed')"
                    :title="t('Random seed')"
                    @click="session.rollSeed()"
                />
            </div>
        </section>

        <section class="card terrain" :class="{ on: session.layers.value.terrain }">
            <Icon :icon="mountain" :size="16" class="icon" />
            <div class="grow">
                <strong>{{ t('Terrain relief') }}</strong>
                <small>{{ session.layers.value.terrain ? t('Shaded') : t('Flat colors') }}</small>
            </div>
            <HoverCard placement="bottom-end">
                <template #trigger
                    ><span class="help" tabindex="0" :aria-label="t('About terrain relief')">?</span></template
                >
                <p class="help-text">
                    {{
                        t(
                            "When on, the map shades the hills by the sun, like the game's own map. When off it uses flat colors, which is faster for browsing."
                        )
                    }}
                </p>
            </HoverCard>
            <ToggleSwitch
                :modelValue="session.layers.value.terrain"
                :aria-label="t('Terrain relief')"
                @update:modelValue="session.setLayer('terrain', !!$event)"
            />
        </section>

        <form class="row" @submit.prevent="go">
            <InputText
                v-model="coordinates"
                size="small"
                :invalid="coordinatesInvalid"
                :placeholder="t('Go to X Z...')"
                :aria-label="t('Go to coordinates')"
                fluid
            />
            <Button type="submit" :label="t('Go')" size="small" variant="outlined" severity="secondary" />
        </form>

        <Button
            :icon="download"
            :label="t('Save image')"
            size="small"
            variant="outlined"
            severity="secondary"
            fluid
            @click="session.savePng()"
        />
        <Button
            v-if="session.isSeedWorld.value"
            :icon="copy"
            :label="t('Copy map link')"
            size="small"
            variant="outlined"
            severity="secondary"
            fluid
            @click="share.copyLink()"
        />

        <h3 class="eyebrow heading">
            <span>{{ t('Map layers') }}</span
            ><Icon :icon="layersIcon" :size="14" />
        </h3>
        <section class="card layers">
            <label v-for="layer in LAYERS" :key="layer.key">
                <Checkbox
                    :modelValue="session.layers.value[layer.key]"
                    binary
                    size="small"
                    :inputId="`layer-${layer.key}`"
                    @update:modelValue="session.setLayer(layer.key, !!$event)"
                />
                <span>{{ t(layer.label) }}</span>
            </label>
        </section>

        <details class="card about" open>
            <summary class="eyebrow">{{ t('About this world') }}</summary>
            <dl>
                <dt>{{ t('Name') }}</dt>
                <dd>{{ session.world.value.name }}</dd>
                <dt>{{ t('Seed') }}</dt>
                <dd>{{ session.seedText.value }}</dd>
                <dt>{{ t('Generator') }}</dt>
                <dd>{{ generator?.label ?? 'Hytale' }}</dd>
                <dt>{{ t('Regions') }}</dt>
                <dd>{{ session.world.value.regions.length }}</dd>
                <template v-if="session.world.value.config.spawn">
                    <dt>{{ t('Spawn') }}</dt>
                    <dd>
                        {{ Math.round(session.world.value.config.spawn.x) }},
                        {{ Math.round(session.world.value.config.spawn.y) }},
                        {{ Math.round(session.world.value.config.spawn.z) }}
                    </dd>
                </template>
                <dt>{{ t('View center') }}</dt>
                <dd>{{ session.centre.value.x }}, {{ session.centre.value.z }}</dd>
            </dl>
            <p class="muted small">{{ t('Clears the saved terrain tiles and biomes on this device.') }}</p>
            <Button
                :icon="trash"
                :label="cacheCleared ? t('Cache cleared') : t('Clear browser cache')"
                size="small"
                variant="outlined"
                severity="secondary"
                fluid
                @click="forgetCache"
            />
        </details>
    </div>
</template>

<style scoped>
.map-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}
.card {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-2);
}
.row {
    display: flex;
    gap: 8px;
}
.card .eyebrow {
    display: block;
    margin-bottom: 8px;
}
.terrain {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 58px;
}
.terrain.on {
    border-color: var(--accent-line);
    background: linear-gradient(180deg, var(--accent-soft), var(--surface-2));
}
.terrain .icon {
    color: var(--accent);
    flex: none;
}
.terrain .grow {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}
.terrain small {
    color: var(--muted);
    font-size: 11px;
}
.terrain.on small {
    color: var(--accent);
}
.help {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    cursor: help;
}
.help:hover,
.help:focus {
    border-color: var(--accent);
    color: var(--accent);
    outline: none;
}
.help-text {
    max-width: 230px;
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
}
.heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 0 -4px;
}
.layers {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.layers label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}
.about summary {
    cursor: pointer;
    margin: 0;
}
.about[open] summary {
    margin-bottom: 10px;
}
dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 0 0 10px;
    font-size: 12.5px;
}
dt {
    color: var(--muted);
}
dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    text-align: right;
    font-variant-numeric: tabular-nums;
}
</style>
