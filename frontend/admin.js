import { createApp } from 'vue';

import tooltip from '@cloudron/pankow/tooltip';

import './style.css';

import App from './App.vue';
import router from './router.js';

const app = createApp(App);

app.use(router);
app.directive('tooltip', tooltip);

app.mount('#app');
