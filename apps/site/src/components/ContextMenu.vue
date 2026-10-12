<script setup lang="ts">
import { Button, Icon } from '@vitral/vue';
import { copy, close, locate, mapPin } from '@vitral/icons';
import { useContextMenu } from '../composables/useContextMenu';
import { useSession } from '../composables/useSession';
import { useShare } from '../composables/useShare';
import { t } from '../lib/i18n';

const menu = useContextMenu();
const session = useSession();
const share = useShare();

function run(action: () => void) {
    action();
    menu.close();
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="menu.state.value.visible"
            class="menu"
            :style="{ left: `${menu.state.value.x}px`, top: `${menu.state.value.y}px` }"
            @click.stop
        >
            <div class="head">
                <div>
                    <strong>{{ menu.state.value.biome }}</strong>
                    <small class="muted">{{ menu.state.value.zone }}</small>
                </div>
                <button :aria-label="t('Close')" @click="menu.close"><Icon :icon="close" :size="12" /></button>
            </div>

            <dl>
                <div>
                    <dt>{{ t('Block X, Z') }}</dt>
                    <dd>{{ menu.state.value.block.x }}, {{ menu.state.value.block.z }}</dd>
                </div>
                <div>
                    <dt>{{ t('Height Y') }}</dt>
                    <dd>~{{ menu.state.value.block.y }}</dd>
                </div>
                <div>
                    <dt>{{ t('Chunk') }}</dt>
                    <dd>{{ menu.state.value.chunk.x }}, {{ menu.state.value.chunk.z }}</dd>
                </div>
                <div>
                    <dt>{{ t('Region') }}</dt>
                    <dd>{{ menu.state.value.region.x }}, {{ menu.state.value.region.z }}</dd>
                </div>
            </dl>

            <p v-if="menu.state.value.mobs.length" class="mobs">
                <span class="eyebrow">{{ t('Mobs here') }}</span>
                {{ menu.state.value.mobs.join(' · ') }}
            </p>
            <p v-if="menu.state.value.distance" class="muted small">
                <Icon :icon="locate" :size="12" /> {{ t('{n} blocks from spawn', { n: menu.state.value.distance }) }}
            </p>

            <div class="actions">
                <Button
                    :icon="copy"
                    :label="t('Copy /tp')"
                    size="small"
                    fluid
                    @click="
                        run(() =>
                            share.copyTeleport(
                                menu.state.value.block.x,
                                menu.state.value.block.y,
                                menu.state.value.block.z
                            )
                        )
                    "
                />
                <Button
                    :icon="mapPin"
                    :label="t('Copy coordinates')"
                    size="small"
                    variant="outlined"
                    severity="secondary"
                    fluid
                    @click="run(() => share.copyCoordinates(menu.state.value.block.x, menu.state.value.block.z))"
                />
                <Button
                    :icon="locate"
                    :label="t('Center here')"
                    size="small"
                    variant="text"
                    severity="secondary"
                    fluid
                    @click="run(() => session.goTo(menu.state.value.block.x, menu.state.value.block.z))"
                />
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.menu {
    position: fixed;
    z-index: 100;
    width: 240px;
    padding: 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
}
.head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}
.head div {
    display: flex;
    flex-direction: column;
}
.head button {
    align-self: flex-start;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 6px;
    background: none;
}
.head button:hover {
    background: rgba(255, 255, 255, 0.08);
}
dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0 0 10px;
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
.mobs {
    margin: 0 0 8px;
    font-size: 12px;
}
.mobs .eyebrow {
    display: block;
    margin-bottom: 2px;
}
.small {
    margin: 0 0 8px;
}
.actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
</style>
