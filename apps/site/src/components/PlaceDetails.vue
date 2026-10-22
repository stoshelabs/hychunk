<script setup lang="ts">
import { Badge, Button, Icon } from '@vitral/vue';
import { check, copy, close, locate, arrowLeft, arrowRight } from '@vitral/icons';
import { usePlaces } from '../composables/usePlaces';
import { useSession } from '../composables/useSession';
import { useShare } from '../composables/useShare';
import { t } from '../lib/i18n';

const places = usePlaces();
const session = useSession();
const share = useShare();

function goToDestination(instance: string) {
    places.closeDetails();
    void session.enterInstance(instance);
}
</script>

<template>
    <aside v-if="places.selected.value" class="card" :aria-label="places.selected.value.name" @click.stop>
        <header>
            <img :src="places.selected.value.iconUrl" alt="" width="36" height="36" />
            <div class="title">
                <h3>{{ places.selected.value.name }}</h3>
                <div class="tags">
                    <Badge :value="places.categoryLabel(places.selected.value.category)" severity="warn" size="small" />
                    <span v-if="places.selected.value.zone || places.selected.value.biome" class="muted small">{{
                        [places.selected.value.zone, t(places.selected.value.biome)].filter(Boolean).join(' · ')
                    }}</span>
                </div>
            </div>
            <button :aria-label="t('Close')" @click="places.closeDetails"><Icon :icon="close" :size="14" /></button>
        </header>

        <p class="description">{{ t(places.selected.value.description) }}</p>

        <p v-if="places.selected.value.mobs.length" class="mobs">
            <span class="eyebrow">{{ t('Mobs') }}</span>
            {{ places.selected.value.mobs.join(' · ') }}
        </p>

        <div v-if="places.selected.value.portal" class="portal">
            <span class="eyebrow">{{ t('Destination') }}</span>
            <strong>{{ places.selected.value.portal.destination }}</strong>
            <span v-if="places.selected.value.portal.subtitle" class="muted small">{{
                places.selected.value.portal.subtitle
            }}</span>
            <span class="muted small">{{
                places.selected.value.portal.kind === 'return'
                    ? t('Return portal: takes you back out of a fragment or instance')
                    : places.selected.value.portal.open
                      ? t('Instance portal: opens a separate world')
                      : t('Fragment portal: its world is made when the portal is used, so it cannot be shown here')
            }}</span>
        </div>

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
                v-if="places.selected.value.portal?.open"
                :icon="arrowRight"
                :label="t('Go to destination')"
                size="small"
                class="wide"
                fluid
                @click="goToDestination(places.selected.value.portal.open)"
            />
            <Button
                v-else-if="places.selected.value.portal?.back"
                :icon="arrowLeft"
                :label="t('Go back')"
                size="small"
                class="wide"
                fluid
                @click="session.leaveInstance()"
            />
            <Button
                :icon="locate"
                :label="t('Focus on map')"
                size="small"
                fluid
                variant="outlined"
                severity="secondary"
                @click="session.goTo(places.selected.value.x, places.selected.value.z)"
            />
            <Button
                :icon="copy"
                :label="t('Copy /tp')"
                size="small"
                fluid
                @click="
                    share.copyTeleport(places.selected.value.x, places.selected.value.y || 100, places.selected.value.z)
                "
            />
            <Button
                :icon="check"
                :label="places.completed.value.has(places.selected.value.id) ? t('Done') : t('Mark as done')"
                size="small"
                :variant="places.completed.value.has(places.selected.value.id) ? 'filled' : 'outlined'"
                :severity="places.completed.value.has(places.selected.value.id) ? 'success' : 'secondary'"
                class="wide"
                fluid
                @click="places.toggleDone(places.selected.value.id)"
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
.portal {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12.5px;
}
.portal .eyebrow {
    margin-bottom: 2px;
}
footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
footer .wide {
    grid-column: 1 / -1;
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
