import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import './style.css';

import Protected from './Protected.vue';

const app = createApp(Protected);

app.use(pankow);

app.mount('#app');
