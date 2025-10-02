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

<script>

import { Button, PasswordInput, fetcher } from '@cloudron/pankow';

const ORIGIN = window.location.origin;

export default {
  name: 'ProtectedView',
  components: {
    Button,
    PasswordInput
  },
  data() {
    return {
      ready: false,
      busy: false,
      origin: ORIGIN,
      error: false,
      returnTo: '/',
      password: '',
      settings: {
        accessRestriction: '',
        title: ''
      }
    };
  },
  async mounted() {
    // ensure we end up in the target destination after oidc login
    this.returnTo = window.location.pathname || '/';

    try {
      const result = await fetcher.get(`${this.origin}/api/settings`);
      this.settings.accessRestriction =  result.body.accessRestriction;
      this.settings.title =  result.body.title;
    } catch (error) {
      console.error(error);
    }

    window.document.title = this.settings.title;

    this.ready = true;

    this.$nextTick(() => document.getElementById('passwordInput').focus());
  },
  methods: {
    async onLogin() {
      this.busy = true;
      this.error = false;

      try {
        const result = await fetcher.post(`${this.origin}/api/protectedLogin`, { password: this.password });
        if (result.status === 200) return window.location.reload();
      } catch (error) {
        console.error(error);
      }

      this.password = '';
      this.busy = false;
      this.error = true;
    }
  }
};

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
