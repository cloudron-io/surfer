<template>
  <div class="login-wrapper" v-show="ready">
    <LoginView
      icon-url="/_admin/logo.png"
      title="Surfer"
      message="Static file server"
      :login-label="`Log in with ${providerName}`"
      footer="Powered by Cloudron"
      @login="onLogin"
    />
  </div>
</template>

<script setup>

import { ref, onMounted } from 'vue';
import { LoginView, fetcher } from '@cloudron/pankow';

const ready = ref(false);
const providerName = ref('Cloudron');

function onLogin() {
  window.location.href = '/_admin';
}

onMounted(async () => {
  try {
    const result = await fetcher.get('/api/settings');
    if (result.status === 200) providerName.value = result.body.oidcProviderName || 'Cloudron';
  } catch (e) {
    console.error(e);
  }

  window.document.title = 'Surfer';
  ready.value = true;
});

</script>

<style>

html, body {
  height: 100%;
  margin: 0;
}

.login-wrapper {
  height: 100%;
  min-height: 100vh;
}

</style>
