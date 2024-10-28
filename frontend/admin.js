import { createApp } from 'vue';

import 'primeicons/primeicons.css';
import tooltip from 'pankow/tooltip';

import './style.css';

import Admin from './Admin.vue';

const app = createApp(Admin);

app.directive('tooltip', tooltip);

app.mount('#app');