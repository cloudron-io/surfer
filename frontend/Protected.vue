<template>
  <div class="login-container" v-show="ready">
    <form @submit="onLogin" @submit.prevent>
      <h1>Login to {{ settings.title }}</h1>
      <div class="p-fluid">
        <div v-show="settings.accessRestriction === 'user'">
          <label for="usernameInput">Username</label>
          <InputText id="usernameInput" type="text" v-model="username"/>
        </div>
        <div>
          <label for="passwordInput">Password</label>
          <Password id="passwordInput" :feedback="false" v-model="password" :class="{ 'p-invalid': error }"/>
          <small v-show="error" :class="{ 'p-invalid': error }">Wrong username or password.</small>
        </div>
      </div>
      <Button type="submit" label="Login" id="loginButton"/>
    </form>
  </div>
</template>

<script>

import superagent from 'superagent';

const ORIGIN = window.location.origin;

export default {
    name: 'Public',
    data() {
        return {
            ready: false,
            busy: true,
            origin: ORIGIN,
            error: false,
            username: '',
            password: '',
            settings: {
                accessRestriction: '',
                title: ''
            }
        };
    },
    methods: {
        onLogin: function () {
            var that = this;

            that.busy = true;
            that.error = false;

            superagent.post(`${that.origin}/api/protectedLogin`).send({ username: that.username, password: that.password }).end(function (error, result) {
                that.busy = false;

                if (error || result.statusCode !== 200) {
                    console.error(error);
                    that.password = '';
                    that.error = true;
                    return;
                }

                window.location.reload();
            });
        }
    },
    mounted() {
        var that = this;

        superagent.get(`${that.origin}/api/settings`).end(function (error, result) {
            if (error) console.error(error);

            that.settings.title =  result.body.title;
            that.settings.accessRestriction =  result.body.accessRestriction;

            window.document.title = that.settings.title;

            that.ready = true;

            that.$nextTick(function() {
                if (that.settings.accessRestriction === 'user') document.getElementById('usernameInput').focus();
                else document.getElementById('passwordInput').focus();
            });
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
