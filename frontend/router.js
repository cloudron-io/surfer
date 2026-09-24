import { createRouter, createWebHashHistory } from 'vue-router';

import FilesView from './views/FilesView.vue';
import SettingsView from './views/SettingsView.vue';
import UsageView from './views/UsageView.vue';

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/settings', name: 'settings', component: SettingsView },
        { path: '/usage', name: 'usage', component: UsageView },
        { path: '/:pathMatch(.*)*', name: 'files', component: FilesView },
    ],
});

export default router;
