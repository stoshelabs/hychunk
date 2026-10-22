<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AppTour from './components/AppTour.vue';
import AppHeader from './components/AppHeader.vue';
import HomeScreen from './components/HomeScreen.vue';
import LegalPage from './components/LegalPage.vue';
import MapStage from './components/MapStage.vue';
import SidebarPanel from './components/SidebarPanel.vue';
import SplashScreen from './components/SplashScreen.vue';
import CacheWarning from './components/CacheWarning.vue';
import CompatibilityWarning from './components/CompatibilityWarning.vue';
import ToastHost from './components/ToastHost.vue';
import UploadDialog from './components/UploadDialog.vue';
import { useGameData } from './composables/useGameData';
import { useLayout } from './composables/useLayout';
import { useSession } from './composables/useSession';
import { useDocumentHead } from './lib/head';

const game = useGameData();
const session = useSession();
useLayout();
useDocumentHead();

onMounted(async () => {
    await game.init();
    if (__DEV_WORLD__ && new URLSearchParams(location.search).has('world')) await session.openDevWorld();
});
onBeforeUnmount(session.dispose);
</script>

<template>
    <div class="app">
        <SplashScreen />
        <AppHeader />
        <main>
            <SidebarPanel />
            <MapStage />
            <HomeScreen v-if="!session.world.value" />
        </main>
        <UploadDialog />
        <LegalPage />
        <AppTour />
        <CacheWarning />
        <CompatibilityWarning />
        <ToastHost />
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--bg);
}
main {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
}
</style>
