<script setup>

import { ref, computed, onMounted, provide, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Dialog, SideBar, TextInput, TopBar, fetcher } from '@cloudron/pankow';
import { siteOrigin } from './utils.js';

const ready = ref(false);
const profile = ref({ username: '', name: '' });
const sites = ref([]);
const sidebar = useTemplateRef('sidebar');
const addDeployDialog = useTemplateRef('addDeployDialog');
const editDialog = useTemplateRef('editDialog');
const siteNameInput = useTemplateRef('siteNameInput');
const editNameInput = useTemplateRef('editNameInput');
const promoteDialog = useTemplateRef('promoteDialog');
const viewRef = ref(null);
const route = useRoute();
const router = useRouter();
const logoUrl = '/_admin/logo.png';
const sitePaths = ref({ default: '/site/default/' });
const siteName = ref('');
const siteDomain = ref('');
const siteError = ref('');
const creatingDeploy = ref(false);
const editing = ref(false);
const editingSite = ref(null);
const editName = ref('');
const editDomain = ref('');
const editError = ref('');
const promoting = ref(false);
const promoteName = ref('');
const promoteError = ref('');
const locationUrl = ref('');

const filesPath = computed(function () {
  const name = route.name === 'site' && route.params.name ? String(route.params.name) : 'default';
  return sitePaths.value[name] || ('/site/' + name + '/');
});

const currentSiteName = computed(function () {
  if (route.name === 'site' && route.params.name) return String(route.params.name).toLowerCase();
  return 'default';
});

const viewSiteHref = computed(function () {
  const row = sites.value.find(function (site) { return site.name === currentSiteName.value; });
  return siteOrigin(row && row.domain) + '/';
});

watch(function () { return route.fullPath; }, function () {
  if (route.name !== 'site' || !route.params.name) return;
  sitePaths.value[String(route.params.name)] = route.fullPath || ('/site/' + route.params.name + '/');
}, { immediate: true });

function onUpload() {
  viewRef.value?.onUpload();
}

function onUploadFolder() {
  viewRef.value?.onUploadFolder();
}

function openNewFolderDialog() {
  viewRef.value?.openNewFolderDialog();
}

const newMenu = [{
  separator: true,
  label: 'Upload',
}, {
  label: 'Upload file',
  icon: 'fa-solid fa-file-arrow-up',
  action: onUpload
}, {
  label: 'Upload folder',
  icon: 'fa-regular fa-folder-open',
  action: onUploadFolder
}, {
  separator: true,
  label: 'Create new',
}, {
  label: 'New folder',
  icon: 'fa-solid fa-folder-plus',
  action: openNewFolderDialog
}];

const profileMenu = [{
  label: 'Log out',
  icon: 'fa-solid fa-arrow-right-from-bracket',
  action: logout
}];

function onCloseSidebar() {
  sidebar.value?.close();
}

function pathForDeploy(name) {
  return sitePaths.value[name] || ('/site/' + name + '/');
}

function siteActions(site) {
  return [{
    label: 'Edit',
    icon: 'fa-solid fa-pen',
    action: function () { openEdit(site); }
  }, {
    label: 'Deploy to default',
    icon: 'fa-solid fa-arrow-right',
    action: function () { openPromote(site); }
  }];
}

function openEdit(site) {
  editingSite.value = site;
  editName.value = site.name;
  editDomain.value = site.domain;
  editError.value = '';
  editDialog.value?.open();
  setTimeout(function () { editNameInput.value?.focus(); }, 100);
}

async function onEdit() {
  if (editing.value) return;

  const site = editingSite.value;
  if (!site) return;

  const name = editName.value.trim().toLowerCase();
  const domain = editDomain.value.trim().toLowerCase();
  if (!name || !domain) {
    editError.value = 'Enter a site name and a site domain';
    return;
  }

  if (name === site.name && domain === site.domain) {
    editDialog.value?.close();
    return;
  }

  editing.value = true;
  editError.value = '';
  try {
    const result = await fetcher.put('/api/sites/' + encodeURIComponent(site.domain), { name: name, domain: domain });
    if (result.status === 401) return login();
    if (result.status !== 200) {
      editError.value = (result.body && (result.body.message || result.body.error)) || 'Could not update site';
      return;
    }

    editDialog.value?.close();
    await loadDeploys();
    if (name !== site.name) moveSitePath(site.name, name);
  } catch (e) {
    editError.value = e.message || 'Could not update site';
  } finally {
    editing.value = false;
  }
}

function moveSitePath(oldName, newName) {
  const prefix = '/site/' + oldName + '/';
  const nextPrefix = '/site/' + newName + '/';
  const current = sitePaths.value[oldName] || prefix;
  const next = current.startsWith(prefix) ? nextPrefix + current.slice(prefix.length) : nextPrefix;
  sitePaths.value[newName] = next;
  if (route.name === 'site' && String(route.params.name) === oldName) router.replace(next);
}

function openPromote(site) {
  promoteName.value = site.name;
  promoteError.value = '';
  promoteDialog.value?.open();
}

async function onPromote() {
  promoting.value = true;
  promoteError.value = '';
  try {
    const result = await fetcher.post('/api/sites/' + encodeURIComponent(promoteName.value) + '/default', {});
    if (result.status === 401) return login();
    if (result.status !== 201) {
      promoteError.value = (result.body && (result.body.message || result.body.error)) || 'Could not deploy to the default site';
      return;
    }

    promoteDialog.value?.close();
    window.pankow.notify({ type: 'success', text: 'Deployed to the default site' });
  } catch (e) {
    promoteError.value = e.message || 'Could not deploy to the default site';
  } finally {
    promoting.value = false;
  }
}

function openAddSite() {
  siteName.value = '';
  siteDomain.value = '';
  siteError.value = '';
  addDeployDialog.value?.open();
  setTimeout(function () { siteNameInput.value?.focus(); }, 100);
}

async function loadDeploys() {
  try {
    const result = await fetcher.get('/api/sites');
    if (result.status === 401) return login();
    if (result.status !== 200 || !Array.isArray(result.body)) return;
    sites.value = result.body;
  } catch (e) {
    console.error(e);
  }
}

async function onCreateDeploy() {
  if (creatingDeploy.value) return;

  const name = siteName.value.trim().toLowerCase();
  const domain = siteDomain.value.trim().toLowerCase();
  if (!name || !domain) {
    siteError.value = 'Enter a site name and a site domain';
    return;
  }

  creatingDeploy.value = true;
  siteError.value = '';
  try {
    const result = await fetcher.post('/api/sites', { name: name, domain: domain });
    if (result.status === 401) return login();
    if (result.status !== 201) {
      siteError.value = (result.body && (result.body.message || result.body.error)) || 'Could not create site';
      return;
    }

    addDeployDialog.value?.close();
    await loadDeploys();
    onCloseSidebar();
    router.push('/site/' + name + '/');
  } catch (e) {
    siteError.value = e.message || 'Could not create site';
  } finally {
    creatingDeploy.value = false;
  }
}

async function loadProfile() {
  try {
    const result = await fetcher.get('/api/profile');
    if (result.status !== 200) return login();

    profile.value = {
      username: result.body.username || '',
      name: result.body.name || ''
    };
  } catch (e) {
    return console.error(e);
  }

  await loadDeploys();
  await loadLocationUrl();
  ready.value = true;
}

async function loadLocationUrl() {
  try {
    const result = await fetcher.get('/api/settings');
    if (result.status === 200 && result.body && result.body.locationUrl) locationUrl.value = result.body.locationUrl;
  } catch (e) {
    console.error(e);
  }
}

function login() {
  window.location.replace('/auth/login?returnTo=/_admin');
}

function logout() {
  profile.value = { username: '', name: '' };
  window.location.href = '/auth/logout';
}

provide('logout', logout);
provide('profile', profile);
provide('sites', sites);

onMounted(loadProfile);

</script>

<template>
  <div v-if="ready" class="main">
    <SideBar ref="sidebar" resizable>
      <div class="sidebar-title">
        <RouterLink to="/" class="sidebar-title-link" @click="onCloseSidebar">
          <img :src="logoUrl" alt="" class="sidebar-icon"/>
          <span class="sidebar-app-name">Surfer</span>
        </RouterLink>
      </div>

      <div class="files-heading">
        <RouterLink class="side-bar-entry files-link" :to="filesPath" @click="onCloseSidebar">
          <i class="fa-solid fa-folder"></i> Sites
        </RouterLink>
        <button class="files-add" type="button" title="Add site" @click="openAddSite">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      <div v-for="site in sites" :key="site.domain" class="deploy-row" :class="{ active: route.name === 'site' && String(route.params.name) === site.name }">
        <RouterLink class="side-bar-entry deploy-entry" :to="pathForDeploy(site.name)" @click="onCloseSidebar">
          <span class="deploy-name">{{ site.name === 'default' ? 'Default' : site.name }}</span>
          <span class="deploy-domain">{{ site.domain }}</span>
        </RouterLink>
        <Button v-if="site.name !== 'default'" class="site-more" plain tool :show-dropdown="false" icon="fa-solid fa-ellipsis" title="Site actions" :menu="siteActions(site)"/>
      </div>
      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'history' }" to="/history" @click="onCloseSidebar">
        <i class="fa-solid fa-clock-rotate-left"></i> History
      </RouterLink>
      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'settings' }" to="/settings" @click="onCloseSidebar">
        <i class="fa-solid fa-gear"></i> Settings
      </RouterLink>
      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'usage' }" to="/usage" @click="onCloseSidebar">
        <i class="fa-solid fa-circle-question"></i> Usage
      </RouterLink>
    </SideBar>
    <div class="main-content">
      <TopBar :left-grow="true">
        <template #left>
          <Button v-if="route.name === 'site'" icon="fa-solid fa-plus" :menu="newMenu" tool><span class="pankow-no-mobile">New</span></Button>
        </template>
        <template #right>
          <Button class="view-site" outline primary :href="viewSiteHref" target="_blank" rel="noopener" icon="fa-solid fa-arrow-up-right-from-square">
            <span class="pankow-no-mobile">View site</span>
          </Button>
          <Button :menu="profileMenu" tool secondary title="Menu">
            <span class="pankow-no-mobile">{{ profile.name || profile.username }}</span>
          </Button>
        </template>
      </TopBar>
      <div class="main-view">
        <RouterView v-slot="{ Component }">
          <component :is="Component" ref="viewRef"/>
        </RouterView>
      </div>
    </div>
    <Dialog ref="addDeployDialog" title="Add site" confirm-label="Create" reject-label="Cancel" confirm-style="success" reject-style="secondary" :confirm-busy="creatingDeploy" @confirm="onCreateDeploy">
      <label class="deploy-field">
        <span>Site name</span>
        <TextInput ref="siteNameInput" v-model="siteName" placeholder="alpha" @keydown.enter="onCreateDeploy"/>
      </label>
      <div class="deploy-field">
        <label class="deploy-field-label" for="site-domain">Site domain</label>
        <TextInput id="site-domain" v-model="siteDomain" placeholder="alpha.example.com" :class="{ 'has-error': siteError }" @update:model-value="siteError = ''" @keydown.enter="onCreateDeploy"/>
        <span class="deploy-hint">Requires an <a v-if="locationUrl" class="deploy-hint-link" :href="locationUrl" target="_blank" rel="noopener">alias domain</a><template v-else>alias domain</template>.</span>
        <span v-if="siteError" class="deploy-error">{{ siteError }}</span>
      </div>
    </Dialog>
    <Dialog ref="editDialog" title="Edit site" confirm-label="Save" reject-label="Cancel" confirm-style="success" reject-style="secondary" :confirm-busy="editing" @confirm="onEdit">
      <label class="deploy-field">
        <span>Site name</span>
        <TextInput ref="editNameInput" v-model="editName" placeholder="alpha" :class="{ 'has-error': editError }" @update:model-value="editError = ''" @keydown.enter="onEdit"/>
      </label>
      <div class="deploy-field">
        <label class="deploy-field-label" for="edit-domain">Site domain</label>
        <TextInput id="edit-domain" v-model="editDomain" placeholder="alpha.example.com" :class="{ 'has-error': editError }" @update:model-value="editError = ''" @keydown.enter="onEdit"/>
        <span class="deploy-hint">Requires an <a v-if="locationUrl" class="deploy-hint-link" :href="locationUrl" target="_blank" rel="noopener">alias domain</a><template v-else>alias domain</template>.</span>
        <span v-if="editError" class="deploy-error">{{ editError }}</span>
      </div>
    </Dialog>
    <Dialog ref="promoteDialog" title="Deploy to default site" confirm-label="Deploy" reject-label="Cancel" confirm-style="success" reject-style="secondary" :confirm-busy="promoting" @confirm="onPromote">
      <p class="deploy-promote">Replace Default with the files from {{ promoteName }}. This site remains unchanged.</p>
      <span v-if="promoteError" class="deploy-error">{{ promoteError }}</span>
    </Dialog>
  </div>
</template>

<style>
.main {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}

.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}

.main-view {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.view-site {
  margin-right: 8px;
}

.pankow-sidebar-container {
  flex-shrink: 0;
}

.pankow-sidebar-inner {
  padding: 16px;
  gap: 10px;
}

.sidebar-title {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.sidebar-title-link {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: white;
  cursor: pointer;
  min-width: 0;
}

.sidebar-title-link:hover {
  opacity: 0.9;
}

.sidebar-icon {
  width: 48px;
  height: 48px;
  margin-right: 6px;
  flex-shrink: 0;
}

.sidebar-app-name {
  font-size: 24px;
  line-height: 1.15;
  min-width: 0;
}

.side-bar-entry {
  display: block;
  cursor: pointer;
  color: white;
  padding: 10px;
  padding-left: 12px;
  border-radius: var(--pankow-border-radius);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  min-height: 38px;
  text-decoration: none;
}

.side-bar-entry.active {
  background-color: rgba(255, 255, 255, 0.1);
  font-weight: bold;
}

.side-bar-entry:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.side-bar-entry > i {
  padding-right: 10px;
}

.files-heading {
  display: flex;
  align-items: center;
  gap: 4px;
}

.files-link {
  flex: 1;
  min-width: 0;
}

.files-add {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--pankow-border-radius);
  background: transparent;
  color: white;
  cursor: pointer;
}

.files-add:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.deploy-row {
  display: flex;
  align-items: center;
  min-width: 0;
  border-radius: var(--pankow-border-radius);
}

.deploy-row.active {
  background-color: rgba(255, 255, 255, 0.1);
}

.deploy-row:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.deploy-row .deploy-entry {
  flex: 1;
  min-width: 0;
  background: transparent;
  white-space: normal;
  line-height: 1.25;
}

.deploy-row .deploy-entry:hover,
.deploy-row.active .deploy-entry {
  background: transparent;
}

.deploy-name,
.deploy-domain {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deploy-row.active .deploy-name {
  font-weight: bold;
}

.deploy-domain {
  margin-top: 2px;
  color: #b7c3ce;
  font-size: 12px;
  font-weight: 400;
}

.deploy-entry {
  padding-left: 38px;
}

.site-more.pankow-button {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin-right: 4px;
  padding: 0;
  color: white;
  background: transparent;
}

.site-more.pankow-button:hover,
.site-more.pankow-button:focus,
.site-more.pankow-button:active {
  color: white;
  background-color: rgba(255, 255, 255, 0.2);
}

.deploy-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.deploy-field-label {
  font-size: 14px;
}

.deploy-hint {
  font-size: 13px;
  color: var(--pankow-color-text-secondary, #666);
}

.deploy-hint-link {
  color: var(--pankow-color-primary, #1a76bf);
  text-decoration: underline;
}

.deploy-error {
  color: var(--pankow-color-danger);
  font-size: 13px;
}

.deploy-promote {
  margin: 0 0 12px;
}

@media (max-width: 576px) {
  .pankow-sidebar-container {
    width: 0;
    min-width: 0;
  }
}
</style>
