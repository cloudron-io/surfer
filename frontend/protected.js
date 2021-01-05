import { createApp } from 'vue';

import PrimeVue from 'primevue/config';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';

import 'primevue/resources/themes/saga-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';

import './style.css';

import Protected from './Protected.vue';

const app = createApp(Protected);

app.use(PrimeVue);

app.component('Button', Button);
app.component('Password', Password);
app.component('InputText', InputText);

app.mount('#app');