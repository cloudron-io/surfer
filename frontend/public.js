import { createApp } from 'vue';

import 'primeicons/primeicons.css';
import tooltip from 'pankow/tooltip';

import './style.css';

import Public from './Public.vue';

const app = createApp(Public);

app.directive('tooltip', tooltip);

app.mount('#app');
