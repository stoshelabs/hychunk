import { createApp } from 'vue';
import { Vitral } from '@vitral/vue';
import { HyChunkTheme } from './theme';
import '@vitral/styles/vitral.css';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.use(Vitral, { theme: { preset: HyChunkTheme, colorScheme: 'dark' } });
app.mount('#app');

// The site's own files are kept in the browser by a service worker (public/sw.js); not in development, where files change all the time.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
}
