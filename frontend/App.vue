<script setup>

import { ref, onMounted, provide, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { Notification, SideBar, fetcher } from '@cloudron/pankow';

const ready = ref(false);
const profile = ref({ username: '', name: '' });
const sidebar = useTemplateRef('sidebar');
const route = useRoute();
const logoUrl = '/_admin/logo.png';

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
      <RouterView/>
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
  flex: 1;
  min-width: 0;
  height: 100%;
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
