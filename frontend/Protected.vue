<template>
  <div class="login-container" v-show="ready">
    <h1>Login to {{ settings.title }}</h1>
    <form @submit="onLogin" @submit.prevent v-show="settings.accessRestriction === 'password'">
      <div style="margin-bottom: 10px;">
        <label for="passwordInput">Password</label>
        <PasswordInput id="passwordInput" :feedback="false" v-model="password" :class="{ 'has-error': error }"/>
        <small v-show="error" :class="{ 'has-error': error }">Wrong password</small>
      </div>
      <Button @click="onLogin" id="loginButton" :loading="busy" :disabled="busy || !password">Login</Button>
    </form>
    <div>
      <Button :href="'/api/oidc/login?returnTo=' + returnTo" v-show="settings.accessRestriction !== 'password'" icon="fa-solid fa-arrow-right-to-bracket">Login with Cloudron</Button>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, nextTick } from 'vue';
import { Button, PasswordInput, fetcher } from '@cloudron/pankow';

const ORIGIN = window.location.origin;

const ready = ref(false);
const busy = ref(false);
const error = ref(false);
const returnTo = ref('/');
const password = ref('');
const settings = ref({
  accessRestriction: '',
  title: ''
});

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
    settings.value.title = result.body.title;
  } catch (e) {
    console.error(e);
  }

  window.document.title = settings.value.title;

  ready.value = true;

  nextTick(() => document.getElementById('passwordInput').focus());
});

</script>

<style>

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
