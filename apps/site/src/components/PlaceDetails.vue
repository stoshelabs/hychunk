<script setup lang="ts">
import { Badge, Button, Icon } from '@vitral/vue';
import { check, copy, close, locate } from '@vitral/icons';
import { usePlaces } from '../composables/usePlaces';
import { useSession } from '../composables/useSession';
import { useShare } from '../composables/useShare';
import { t } from '../lib/i18n';

const places = usePlaces();
const session = useSession();
const share = useShare();
</script>

<template>
    <aside v-if="places.selected.value" class="card" :aria-label="places.selected.value.name" @click.stop>
        <header>
            <img :src="places.selected.value.iconUrl" alt="" width="36" height="36" />
            <div class="title">
                <h3>{{ places.selected.value.name }}</h3>
                <div class="tags">
                    <Badge :value="places.categoryLabel(places.selected.value.category)" severity="warn" size="small" />
                    <span v-if="places.selected.value.biome" class="muted small">{{
                        places.selected.value.biome
                    }}</span>
                </div>
            </div>
            <button :aria-label="t('Close')" @click="places.closeDetails"><Icon :icon="close" :size="14" /></button>
        </header>

        <p class="description">{{ t(places.selected.value.description) }}</p>

        <button
            class="done"
            :class="{ on: places.completed.value.has(places.selected.value.id) }"
            @click="places.toggleDone(places.selected.value.id)"
        >
            <Icon :icon="check" :size="14" />
            {{ places.completed.value.has(places.selected.value.id) ? t('Done') : t('Mark as done') }}
        </button>

        <p v-if="places.selected.value.mobs.length" class="mobs">
            <span class="eyebrow">{{ t('Mobs') }}</span>
            {{ places.selected.value.mobs.join(' · ') }}
        </p>

        <dl>
            <div>
                <dt>{{ t('Coordinates X, Z') }}</dt>
                <dd>{{ Math.round(places.selected.value.x) }}, {{ Math.round(places.selected.value.z) }}</dd>
            </div>
            <div>
                <dt>{{ t('Distance from spawn') }}</dt>
                <dd>{{ t('{n} blocks', { n: places.selected.value.distance }) }}</dd>
            </div>
        </dl>

        <footer>
            <Button
                :icon="locate"
                :label="t('Focus on map')"
                size="small"
                variant="outlined"
                severity="secondary"
                @click="session.goTo(places.selected.value.x, places.selected.value.z)"
            />
            <Button
                :icon="copy"
                :label="t('Copy /tp')"
                size="small"
                @click="
                    share.copyTeleport(places.selected.value.x, places.selected.value.y || 100, places.selected.value.z)
                "
            />
        </footer>
    </aside>
</template>

<style scoped>
.card {
    position: absolute;
    left: 14px;
    bottom: calc(60px + env(safe-area-inset-bottom));
    z-index: 7;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(340px, calc(100% - 28px));
    padding: 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
}
header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}
header img {
    flex: none;
    padding: 4px;
    border-radius: 8px;
    background: var(--surface-2);
    image-rendering: pixelated;
}
.title {
    flex: 1;
    min-width: 0;
}
h3 {
    margin: 0 0 4px;
    font-size: 14px;
}
.tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}
header button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: none;
}
header button:hover {
    background: rgba(255, 255, 255, 0.08);
}
.description {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
}
.done {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 6px 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12px;
    font-weight: 600;
}
.done.on {
    border-color: rgba(52, 211, 153, 0.5);
    background: rgba(52, 211, 153, 0.15);
    color: #34d399;
}
.mobs {
    margin: 0;
    font-size: 12px;
}
.mobs .eyebrow {
    display: block;
    margin-bottom: 2px;
}
dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
}
dl div {
    display: flex;
    flex-direction: column;
}
dt {
    font-size: 10.5px;
    color: var(--muted);
}
dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}
footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

@media (max-width: 768px) {
    .card {
        left: 10px;
        bottom: calc(10px + env(safe-area-inset-bottom));
        max-height: 60dvh;
        overflow-y: auto;
    }
}
</style>
