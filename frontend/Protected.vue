<template>
  <div class="login-wrapper" v-show="ready">
    <LoginView
      v-if="settings.accessRestriction !== 'password'"
      icon-url="/_admin/logo.png"
      title="Surfer"
      message="Static file server"
      :login-label="`Log in with ${providerName}`"
      footer="Powered by Cloudron"
      @login="onOidcLogin"
    />
    <div v-else class="login-container">
      <h1>Log in to Surfer</h1>
      <form @submit.prevent="onLogin">
        <div style="margin-bottom: 10px;">
          <label for="passwordInput">Password</label>
          <PasswordInput id="passwordInput" :feedback="false" v-model="password" :class="{ 'has-error': error }"/>
          <small v-show="error" :class="{ 'has-error': error }">Wrong password</small>
        </div>
        <Button @click="onLogin" id="loginButton" :loading="busy" :disabled="busy || !password">Log in</Button>
      </form>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, nextTick } from 'vue';
import { Button, LoginView, PasswordInput, fetcher } from '@cloudron/pankow';

const ORIGIN = window.location.origin;

const ready = ref(false);
const busy = ref(false);
const error = ref(false);
const returnTo = ref('/');
const password = ref('');
const providerName = ref('Cloudron');
const settings = ref({
  accessRestriction: ''
});

function onOidcLogin() {
  window.location.href = '/auth/login?returnTo=' + returnTo.value;
}

async function onLogin() {
  busy.value = true;
  error.value = false;

  try {
    const result = await fetcher.post(`${ORIGIN}/api/protectedLogin`, { password: password.value });
    if (result.status === 200) return window.location.reload();
  } catch (e) {
    console.error(e);
  }

  password.value = '';
  busy.value = false;
  error.value = true;
}

onMounted(async () => {
  returnTo.value = window.location.pathname || '/';

  try {
    const result = await fetcher.get(`${ORIGIN}/api/settings`);
    settings.value.accessRestriction = result.body.accessRestriction;
    providerName.value = result.body.oidcProviderName || 'Cloudron';
  } catch (e) {
    console.error(e);
  }

  window.document.title = 'Surfer';

  ready.value = true;

  if (settings.value.accessRestriction === 'password') {
    nextTick(() => document.getElementById('passwordInput')?.focus());
  }
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

.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 480px;
  height: 60%;
  margin: auto;
  padding: 20px;
}

</style>
