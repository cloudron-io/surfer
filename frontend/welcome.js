import { createApp } from 'vue';

import tooltip from '@cloudron/pankow/tooltip';

import './style.css';

import Welcome from './Welcome.vue';

const app = createApp(Welcome);

app.directive('tooltip', tooltip);

app.mount('#app');
