import { createApp } from 'vue';

import PrimeVue from 'primevue/config';
import Button from 'primevue/button';
import Breadcrumb from 'primevue/breadcrumb';
import Toolbar from 'primevue/toolbar';
import Tooltip from 'primevue/tooltip';
import ToastService from 'primevue/toastservice';
import Toast from 'primevue/toast';

import 'primevue/resources/themes/saga-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';

import './style.css';

import Public from './Public.vue';
import EntryList from './components/EntryList.vue';
import Preview from './components/Preview.vue';

const app = createApp(Public);

app.use(PrimeVue);
app.use(ToastService);

app.component('Button', Button);
app.component('Breadcrumb', Breadcrumb);
app.component('Toolbar', Toolbar);
app.component('Toast', Toast);

app.directive('tooltip', Tooltip);

// custom components
app.component('EntryList', EntryList);
app.component('Preview', Preview);

app.mount('#app');