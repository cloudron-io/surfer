import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import './style.css';

import Public from './Public.vue';

const app = createApp(Public);

app.use(pankow);

app.mount('#app');
