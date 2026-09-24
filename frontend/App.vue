<script setup>

import { ref, onMounted, provide, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { Button, Dialog, InputDialog, Notification, SideBar, TopBar, fetcher } from '@cloudron/pankow';
import { copyToClipboard } from '@cloudron/pankow/utils.js';

const ready = ref(false);
const profile = ref({ username: '', name: '' });
const sidebar = useTemplateRef('sidebar');
const viewRef = ref(null);
const accessTokenDialog = ref(null);
const inputDialog = ref(null);
const accessTokens = ref([]);
const route = useRoute();
const logoUrl = '/_admin/logo.png';

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
  label: 'Access tokens',
  icon: 'fa-solid fa-key',
  action: openAccessTokenDialog
}, {
  separator: true
}, {
  label: 'Log out',
  icon: 'fa-solid fa-arrow-right-from-bracket',
  action: logout
}];

function onCloseSidebar() {
  sidebar.value?.close();
}

async function initWithToken(accessToken) {
  if (!accessToken) return login();

  try {
    const result = await fetcher.get('/api/profile', { access_token: accessToken });
    if (result.status !== 200) {
      delete localStorage.accessToken;
      return login();
    }

    profile.value = {
      username: result.body.username || '',
      name: result.body.name || ''
    };
  } catch (e) {
    return console.error(e);
  }

  ready.value = true;

  localStorage.accessToken = accessToken;
}

async function login() {
  try {
    const result = await fetcher.get('/api/token');
    if (result.status !== 201) return window.location.replace('/auth/login?returnTo=/_admin');
    localStorage.accessToken = result.body.accessToken;
  } catch {
    return window.location.replace('/auth/login?returnTo=/_admin');
  }

  await initWithToken(localStorage.accessToken);
}

async function logout() {
  await fetcher.del('/api/tokens/' + localStorage.accessToken, {}, { access_token: localStorage.accessToken });
  profile.value = { username: '', name: '' };
  delete localStorage.accessToken;
  window.location.href = '/auth/logout';
}

async function refreshAccessTokens() {
  try {
    const result = await fetcher.get('/api/tokens', { access_token: localStorage.accessToken });
    accessTokens.value = result.body.accessTokens.map(function (token) { return { value: token }; });
  } catch (e) {
    window.pankow.notify({ type: 'danger', text: e.message });
  }
}

async function openAccessTokenDialog() {
  accessTokenDialog.value.open();
  await refreshAccessTokens();
}

function onCopyAccessToken(value) {
  copyToClipboard(value);
  window.pankow.notify({ type: 'success', text: 'Token copied to clipboard' });
}

async function onCreateAccessToken() {
  try {
    await fetcher.post('/api/tokens', {}, { access_token: localStorage.accessToken });
  } catch (e) {
    return window.pankow.notify({ type: 'danger', text: e.message });
  }

  await refreshAccessTokens();
}

async function onDeleteAccessToken(token) {
  const yes = await inputDialog.value.confirm({
    message: 'Really revoke this access token? Any actions currently using this token will fail.',
    confirmStyle: 'danger',
    confirmLabel: 'Yes',
    rejectLabel: 'No',
    rejectStyle: 'secondary',
    modal: false
  });

  if (!yes) return;

  try {
    await fetcher.delete(`/api/tokens/${token}`, {}, { access_token: localStorage.accessToken });
  } catch (e) {
    return window.pankow.notify({ type: 'danger', text: e.message });
  }

  await refreshAccessTokens();
}

provide('logout', logout);
provide('profile', profile);

onMounted(async () => {
  await initWithToken(localStorage.accessToken);
});

</script>

<template>
  <Notification/>
  <div v-if="ready" class="main">
    <SideBar ref="sidebar">
      <div class="sidebar-title">
        <RouterLink to="/" class="sidebar-title-link" @click="onCloseSidebar">
          <img :src="logoUrl" alt="" class="sidebar-icon"/>
          <span class="sidebar-app-name">Surfer</span>
        </RouterLink>
      </div>

      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'files' }" to="/" @click="onCloseSidebar">
        <i class="fa-solid fa-folder"></i> Files
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
          <Button v-if="route.name === 'files'" icon="fa-solid fa-plus" :menu="newMenu" tool><span class="pankow-no-mobile">New</span></Button>
        </template>
        <template #right>
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

    <InputDialog ref="inputDialog"/>
    <Dialog ref="accessTokenDialog" :show-x="true" title="Access tokens">
      <p>
        These tokens are useful to programmatically deploy assets for example within a CI/CD pipeline. They are also used for WebDAV login as the password.<br/>
        <br/>
        <em>Tokens are shared between <b>all</b> users.</em>
      </p>
      <div>
        <h3 style="display: flex; justify-content: space-between; align-items: center;">
          <span v-show="accessTokens.length">Issued tokens:</span>
          <Button success @click="onCreateAccessToken()">Create new access token</Button>
        </h3>
        <div v-for="accessToken in accessTokens" :key="accessToken.value">
          <span @click="onCopyAccessToken(accessToken.value)" style="cursor: copy; font-family: monospace;">{{ accessToken.value }}</span>
          <Button style="margin: 0 6px" primary tool plain icon="fa-regular fa-copy" v-tooltip="'Copy token to clipboard'" @click="onCopyAccessToken(accessToken.value)"/>
          <Button danger tool plain icon="fa-solid fa-trash" v-tooltip="'Revoke token'" @click="onDeleteAccessToken(accessToken.value)"/>
        </div>
      </div>
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

.pankow-sidebar-container {
  width: 256px;
  min-width: 256px;
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

@media (max-width: 576px) {
  .pankow-sidebar-container {
    width: 0;
    min-width: 0;
  }
}
</style>
