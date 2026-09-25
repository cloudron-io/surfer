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
        { path: '/site/:name/:pathMatch(.*)*', name: 'site', component: FilesView },
        { path: '/', redirect: '/site/default/' },
        { path: '/:pathMatch(.*)*', redirect: function (to) {
            const match = to.params.pathMatch;
            const suffix = Array.isArray(match) ? match.join('/') : (match || '');
            return suffix ? '/site/default/' + suffix : '/site/default/';
        } },
    ],
});

export default router;
