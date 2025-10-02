import { createApp } from 'vue';

import tooltip from '@cloudron/pankow/tooltip';

import './style.css';

import Public from './Public.vue';

const app = createApp(Public);

app.directive('tooltip', tooltip);

app.mount('#app');
