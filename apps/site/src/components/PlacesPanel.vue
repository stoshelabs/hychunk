<script setup lang="ts">
import { Button, Checkbox, InputText, ToggleButton, Tooltip as vTooltip, VirtualScroller } from '@vitral/vue';
import { copy, locate } from '@vitral/icons';
import { usePlaces, type Place } from '../composables/usePlaces';
import { useLayout } from '../composables/useLayout';
import { useSession } from '../composables/useSession';
import { useShare } from '../composables/useShare';
import { tn, t } from '../lib/i18n';
import CollapseSection from './CollapseSection.vue';
import PlayersSection from './PlayersSection.vue';
import SpawnTools from './SpawnTools.vue';

const ROW_HEIGHT = 56;

const places = usePlaces();
const session = useSession();
const share = useShare();
const layout = useLayout();

const select = (place: Place) => {
    places.select(place);
    layout.closeOnMobile();
};
const focus = (place: Place) => {
    session.goTo(place.x, place.z);
    layout.closeOnMobile();
};

// the list's scroller hands items over untyped
const asPlace = (item: unknown) => item as Place;
</script>

<template>
    <div class="places">
        <div class="head">
            <PlayersSection />

            <InputText
                v-model="places.search.value"
                data-tour="places-search"
                size="small"
                :placeholder="t('Search by name or type...')"
                :aria-label="t('Search places')"
                fluid
            />

            <CollapseSection id="filters" :title="t('Filters')">
                <div class="chips" data-tour="places-filters">
                    <ToggleButton
                        v-for="c in places.chips.value"
                        :key="c.key"
                        :modelValue="places.filters.value[c.key]"
                        size="small"
                        class="chip"
                        :class="{ active: places.filters.value[c.key] }"
                        :title="t(c.title)"
                        @change="places.toggleFilter(c.key)"
                    >
                        <img :src="c.icon" alt="" width="18" height="18" />
                        <span>{{ t(c.label) }}</span>
                        <b>{{ places.counts.value[c.key] }}</b>
                    </ToggleButton>
                </div>

                <div class="bar" data-tour="places-bar">
                    <button class="link" @click="places.setAllFilters(true)">{{ t('All') }}</button>
                    <button class="link" @click="places.setAllFilters(false)">{{ t('None') }}</button>
                    <label class="done-toggle">
                        <Checkbox
                            :modelValue="places.hideCompleted.value"
                            binary
                            size="small"
                            inputId="hide-done"
                            @update:modelValue="places.setHideCompleted(!!$event)"
                        />
                        <span>{{ t('Hide done') }} ({{ places.completed.value.size }})</span>
                    </label>
                    <span class="grow" />
                    <button class="link" :title="t('Save the filtered list as CSV')" @click="places.exportCsv">
                        CSV
                    </button>
                </div>
            </CollapseSection>

            <SpawnTools data-tour="places-tools" />
            <small class="muted">{{
                tn(places.list.value.length, '{n} place, nearest first', '{n} places, nearest first')
            }}</small>
        </div>

        <VirtualScroller
            v-if="places.list.value.length"
            :items="places.list.value"
            :itemSize="ROW_HEIGHT"
            dataKey="id"
            class="list"
            data-tour="places-list"
            scrollHeight="100%"
        >
            <template #item="{ item }">
                <div class="row" @click="select(asPlace(item))">
                    <img :src="asPlace(item).iconUrl" alt="" width="32" height="32" loading="lazy" />
                    <div class="text">
                        <span class="name" :class="{ done: places.completed.value.has(asPlace(item).id) }">{{
                            asPlace(item).name || t('Structure')
                        }}</span>
                        <span class="meta"
                            >{{ places.categoryLabel(asPlace(item).category) }} · {{ Math.round(asPlace(item).x) }},
                            {{ Math.round(asPlace(item).z) }}</span
                        >
                    </div>
                    <Button
                        v-tooltip.left="t('Focus on map')"
                        :icon="locate"
                        size="small"
                        variant="text"
                        severity="secondary"
                        :aria-label="t('Focus on map')"
                        @click.stop="focus(asPlace(item))"
                    />
                    <Button
                        v-tooltip.left="t('Copy /tp')"
                        :icon="copy"
                        size="small"
                        variant="text"
                        severity="secondary"
                        :aria-label="t('Copy /tp')"
                        @click.stop="share.copyTeleport(asPlace(item).x, asPlace(item).y || 100, asPlace(item).z)"
                    />
                </div>
            </template>
        </VirtualScroller>
        <p v-else class="empty muted small">{{ t('No places match these filters.') }}</p>
    </div>
</template>

<style scoped>
.places {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
}
.head {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 8px;
}
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 4px 8px;
    font-size: 11.5px;
    line-height: 1;
    opacity: 0.6;
}
.chip.active {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--text);
    opacity: 1;
}
.chip :deep(*) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.chip b {
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 10px;
    font-weight: 600;
}
.chip img {
    image-rendering: pixelated;
}
.bar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}
.grow {
    flex: 1;
}
.link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
}
.link:hover {
    text-decoration: underline;
}
.done-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
}
.list {
    flex: 1;
    min-height: 120px;
    min-width: 0;
}
.list :deep(.vt-virtualscroller-content) {
    width: 100% !important;
    min-width: 0;
}
.list :deep(.vt-virtualscroller-content > *) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}
.row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 50px;
    margin-bottom: 6px;
    padding: 6px 6px 6px 8px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
}
.row:hover {
    border-color: var(--accent-line);
}
.row img {
    flex: none;
    padding: 3px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    image-rendering: pixelated;
}
.text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
}
.name,
.meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.name {
    font-size: 12.5px;
    font-weight: 600;
}
.name.done {
    opacity: 0.55;
    text-decoration: line-through;
}
.meta {
    color: var(--muted);
    font-family: ui-monospace, monospace;
    font-size: 11px;
}
.empty {
    padding: 12px 0;
}
</style>
