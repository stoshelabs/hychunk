import { createApp } from 'vue';
import { Vitral } from '@vitral/vue';
import { HyChunkTheme } from './theme';
import '@vitral/styles/vitral.css';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.use(Vitral, { theme: { preset: HyChunkTheme, colorScheme: 'dark' } });
app.mount('#app');
