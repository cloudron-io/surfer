<template>
  <div class="login-container" v-show="ready">
    <h1>Login to {{ settings.title }}</h1>
    <form @submit="onLogin" @submit.prevent v-show="settings.accessRestriction === 'password'">
      <div class="p-fluid">
        <div>
          <label for="passwordInput">Password</label>
          <Password inputId="passwordInput" :feedback="false" v-model="password" :class="{ 'p-invalid': error }"/>
          <small v-show="error" :class="{ 'p-invalid': error }">Wrong username or password.</small>
        </div>
      </div>
      <Button type="submit" label="Login" id="loginButton"/>
    </form>
    <a :href="'/api/oidc/login?returnTo=' + returnTo" v-show="settings.accessRestriction !== 'password'"><Button class="p-button-sm" label="Login with Cloudron" icon="pi pi-sign-in"/></a>
  </div>
</template>

<script>

import superagent from 'superagent';

const ORIGIN = window.location.origin;

export default {
    name: 'ProtectedView',
    data() {
        return {
            ready: false,
            busy: true,
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
    methods: {
        onLogin: function () {
            this.busy = true;
            this.error = false;

            superagent.post(`${this.origin}/api/protectedLogin`).send({ password: that.password }).end((error, result) => {
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
    }
};

</script>

<style>

.login-container {
    max-width: 480px;
    margin: auto;
    padding: 20px;
}

.p-fluid > div {
    margin-bottom: 10px;
}

</style>
