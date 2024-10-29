import { createApp } from 'vue';

import 'primeicons/primeicons.css';
import tooltip from 'pankow/tooltip';

import './style.css';

import Protected from './Protected.vue';

const app = createApp(Protected);

app.directive('tooltip', tooltip);

app.mount('#app');
