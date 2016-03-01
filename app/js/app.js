(function () {
'use strict';

function login(username, password) {
    username = username || app.loginData.username;
    password = password || app.loginData.password;

    app.busy = true;

    superagent.get('/api/files/').query({ username: username, password: password }).end(function (error, result) {
        app.busy = false;

        if (error) return console.error(error);
        if (result.statusCode === 401) return console.error('Invalid credentials');

        app.session.valid = true;
        app.session.username = username;
        app.session.password = password;

        // clearly not the best option
        localStorage.username = username;
        localStorage.password = password;
    });
}

function logout() {
    app.session.valid = false;
    app.session.username = username;
    app.session.password = password;

    delete localStorage.username;
    delete localStorage.password;
}

var app = new Vue({
    el: '#app',
    data: {
        busy: true,
        session: {
            valid: false
        },
        loginData: {

        }
    },
    methods: {
        login: login,
        logout: logout
    }
});

window.app = app;

login(localStorage.username, localStorage.password);

})();
