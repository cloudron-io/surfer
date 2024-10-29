<template>
  <div class="login-container" v-show="ready">
    <h1>Login to {{ settings.title }}</h1>
    <form @submit="onLogin" @submit.prevent v-show="settings.accessRestriction === 'password'">
      <div>
        <label for="passwordInput">Password</label>
        <PasswordInput id="passwordInput" :feedback="false" v-model="password" :class="{ 'has-error': error }"/>
        <small v-show="error" :class="{ 'has-error': error }">Wrong username or password.</small>
      </div>
      <Button @click="onLogin" id="loginButton" :loading="busy" :disabled="busy || !password">Login</Button>
    </form>
    <div>
      <Button :href="'/api/oidc/login?returnTo=' + returnTo" v-show="settings.accessRestriction !== 'password'" icon="pi pi-sign-in">Login with Cloudron</Button>
    </div>
  </div>
</template>

<script>

import { Button, PasswordInput } from 'pankow';
import superagent from 'superagent';

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
  mounted() {
    // ensure we end up in the target destination after oidc login
    this.returnTo = window.location.pathname || '/';

    superagent.get(`${this.origin}/api/settings`).end((error, result) => {
      if (error) console.error(error);

      this.settings.title =  result.body.title;
      this.settings.accessRestriction =  result.body.accessRestriction;

      window.document.title = this.settings.title;

      this.ready = true;

      this.$nextTick(() => document.getElementById('passwordInput').focus());
    });
  },
  methods: {
    onLogin() {
      this.busy = true;
      this.error = false;

      superagent.post(`${this.origin}/api/protectedLogin`).send({ password: this.password }).end((error, result) => {
        this.busy = false;

        if (error || result.statusCode !== 200) {
          console.error(error);
          this.password = '';
          this.error = true;
          return;
        }

        window.location.reload();
      });
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
