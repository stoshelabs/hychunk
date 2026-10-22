<script setup lang="ts">
import { Icon, InputText } from '@vitral/vue';
import { compass, dices, folderOpen, search as searchIcon, sparkles } from '@vitral/icons';
import { useSession } from '../composables/useSession';
import { useUpload } from '../composables/useUpload';
import { assetUrl } from '../lib/assets';
import LegalNotice from './LegalNotice.vue';
import { t } from '../lib/i18n';

const session = useSession();
const upload = useUpload();

const features = [
    {
        icon: folderOpen,
        title: 'Reads real saves',
        text: 'Drop a server folder and browse regions, chunks, markers and players. Your files never leave your device.'
    },
    {
        icon: compass,
        title: 'Predicts the unexplored',
        text: 'Terrain, trees, monuments and camps are generated from the seed, so chunks nobody visited are on the map too.'
    },
    {
        icon: searchIcon,
        title: 'Finds what matters',
        text: 'Search dungeons, temples and portals, see where mobs spawn, highlight biomes and share a link to any seed.'
    }
];
</script>

<template>
    <div class="home" :style="{ '--hero': `url(${assetUrl('hero-map.jpg')})` }">
        <div class="content">
            <span class="badge"
                ><Icon :icon="sparkles" :size="13" /> {{ t('Free and open source map for Hytale') }}</span
            >
            <h1>
                {{ t('Explore every chunk of your') }} <em>{{ t('Hytale world') }}</em>
            </h1>
            <p class="lead">
                {{
                    t(
                        'Open a server save or enter a seed. HyChunk draws the terrain, structures, dungeons and mob spawns in your browser, and predicts the chunks nobody has visited.'
                    )
                }}
            </p>

            <div class="actions" data-tour="start">
                <button class="primary" :disabled="session.busy.value" @click="upload.open">
                    <Icon :icon="folderOpen" :size="18" />
                    {{ t('Open a saved world') }}
                </button>
                <span class="or">{{ t('or') }}</span>
                <form class="seed" @submit.prevent="session.openSeed()">
                    <InputText
                        v-model="session.seedText.value"
                        :placeholder="t('Enter a seed')"
                        :aria-label="t('Seed')"
                    />
                    <button
                        type="button"
                        class="square"
                        :aria-label="t('Random seed')"
                        :title="t('Random seed')"
                        @click="session.rollSeed()"
                    >
                        <Icon :icon="dices" :size="16" />
                    </button>
                    <button type="submit" class="go">{{ t('Generate') }}</button>
                </form>
            </div>

            <p v-if="session.error.value" class="error" role="alert">{{ session.error.value }}</p>
            <p class="privacy muted small">{{ t('Everything runs in your browser. Nothing is uploaded.') }}</p>
        </div>

        <ul class="features">
            <li v-for="f in features" :key="f.title">
                <span class="icon"><Icon :icon="f.icon" :size="18" /></span>
                <strong>{{ t(f.title) }}</strong>
                <p>{{ t(f.text) }}</p>
            </li>
        </ul>
        <LegalNotice class="legal" />
    </div>
</template>

<style scoped>
.home {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: clamp(24px, 4vh, 40px);
    padding: clamp(32px, 6vh, 56px) 20px 40px;
    overflow-y: auto;
    background: var(--bg);
}
.home::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--hero) center / cover;
    opacity: 0.6;
    filter: saturate(0.95);
}
.home::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
        radial-gradient(ellipse at 50% 38%, rgba(11, 14, 20, 0.2) 0%, rgba(11, 14, 20, 0.66) 60%, var(--bg) 100%),
        linear-gradient(180deg, rgba(11, 14, 20, 0.65) 0%, transparent 28%, transparent 60%, var(--bg) 100%);
}
.content,
.features,
.legal {
    position: relative;
    z-index: 1;
}
.content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    max-width: 720px;
    text-align: center;
}
.badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border: 1px solid var(--accent-line);
    border-radius: 999px;
    background: rgba(245, 165, 36, 0.1);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
}
h1 {
    margin: 0;
    font-size: clamp(30px, 6.2vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.02em;
}
h1 em {
    font-style: normal;
    background: linear-gradient(90deg, #ffd27a, var(--accent) 55%, #e0791a);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
.lead {
    margin: 0;
    max-width: 600px;
    color: #b6beca;
    font-size: clamp(14px, 2.2vw, 17px);
    line-height: 1.55;
}
.actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 6px;
}
.primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 24px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: #17110a;
    font-size: 15px;
    font-weight: 700;
    box-shadow: 0 10px 30px rgba(245, 165, 36, 0.28);
}
.primary:hover:not(:disabled) {
    filter: brightness(1.08);
}
.or {
    color: var(--muted);
    font-size: 13px;
}
.seed {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: rgba(17, 22, 31, 0.7);
    backdrop-filter: blur(10px);
}
.seed :deep(input) {
    width: 150px;
}
.square,
.go {
    height: 38px;
    border: 0;
    border-radius: 8px;
}
.square {
    display: grid;
    place-items: center;
    width: 38px;
    background: var(--surface-2);
}
.square:hover {
    background: #222a3a;
}
.go {
    padding: 0 16px;
    background: rgba(245, 165, 36, 0.16);
    color: var(--accent);
    font-weight: 700;
}
.go:hover {
    background: rgba(245, 165, 36, 0.26);
}
.error {
    margin: 0;
    color: #f87171;
}
.privacy {
    margin: 0;
}
.features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    width: min(960px, 100%);
    margin: 0;
    padding: 0;
    list-style: none;
}
.features li {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px;
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    background: rgba(17, 22, 31, 0.62);
    backdrop-filter: blur(12px);
}
.icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-bottom: 4px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent);
}
.features p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
}

@media (max-width: 768px) {
    .home {
        justify-content: flex-start;
        gap: 28px;
        padding-top: 40px;
    }
    .features {
        grid-template-columns: 1fr;
    }
    .actions {
        flex-direction: column;
        width: 100%;
    }
    .primary {
        width: 100%;
        justify-content: center;
    }
    .or {
        display: none;
    }
    .seed {
        width: 100%;
    }
    .seed :deep(.vt-field),
    .seed :deep(input) {
        flex: 1;
        width: 100%;
        min-width: 0;
    }
}
</style>
