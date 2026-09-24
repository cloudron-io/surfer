<script setup>

import { ref, onMounted, provide, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button, Notification, SideBar, TopBar, fetcher } from '@cloudron/pankow';

const ready = ref(false);
const profile = ref({ username: '', name: '' });
const sidebar = useTemplateRef('sidebar');
const viewRef = ref(null);
const route = useRoute();
const logoUrl = '/_admin/logo.png';
const filesPath = ref('/');

watch(function () { return route.fullPath; }, function () {
  if (route.name === 'files') filesPath.value = route.fullPath || '/';
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

  ready.value = true;
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

onMounted(loadProfile);

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

      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'files' }" :to="filesPath" @click="onCloseSidebar">
        <i class="fa-solid fa-folder"></i> Files
      </RouterLink>
      <RouterLink class="side-bar-entry" :class="{ active: route.name === 'deploys' }" to="/deploys" @click="onCloseSidebar">
        <i class="fa-solid fa-cloud-arrow-up"></i> Deploys
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
          <Button class="view-site" outline primary href="/" target="_blank" rel="noopener" icon="fa-solid fa-arrow-up-right-from-square">
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
