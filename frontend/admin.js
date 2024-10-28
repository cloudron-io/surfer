import { createApp } from 'vue';

import 'primeicons/primeicons.css';

import './style.css';

import Admin from './Admin.vue';

const app = createApp(Admin);

app.mount('#app');