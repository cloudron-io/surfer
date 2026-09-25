import { createRouter, createWebHashHistory } from 'vue-router';

import HistoryView from './views/HistoryView.vue';
import FilesView from './views/FilesView.vue';
import SettingsView from './views/SettingsView.vue';
import UsageView from './views/UsageView.vue';

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/history', name: 'history', component: HistoryView },
        { path: '/settings', name: 'settings', component: SettingsView },
        { path: '/usage', name: 'usage', component: UsageView },
        { path: '/:pathMatch(.*)*', name: 'files', component: FilesView },
    ],
});

export default router;
