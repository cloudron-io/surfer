import { createApp } from 'vue';

import pankow from '@cloudron/pankow';

import './style.css';

import Welcome from './Welcome.vue';

const app = createApp(Welcome);

app.use(pankow);

app.mount('#app');
