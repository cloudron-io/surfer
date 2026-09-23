<script setup>

import { ref, onMounted, provide } from 'vue';
import { Notification, fetcher } from '@cloudron/pankow';

const ready = ref(false);
const profile = ref({ username: '', name: '' });

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
  <RouterView v-if="ready"/>
</template>
