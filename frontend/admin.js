import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import './style.css';

import App from './App.vue';
import router from './router.js';

const app = createApp(App);

app.use(router);
app.use(pankow);

app.mount('#app');
