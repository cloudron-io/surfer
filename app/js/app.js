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

        loadDirectory(app.path);
    });
}

function logout() {
    app.session.valid = false;
    app.session.username = username;
    app.session.password = password;

    delete localStorage.username;
    delete localStorage.password;
}

function sanitize(filePath) {
    filePath = '/' + filePath;
    return filePath.replace(/\/+/g, '/');
}

function loadDirectory(filePath) {
    app.busy = true;

    filePath = filePath ? sanitize(filePath) : '/';

    console.log(filePath);

    superagent.get('/api/files/' + filePath).query({ username: app.session.username, password: app.session.password }).end(function (error, result) {
        app.busy = false;

        if (error) return console.error(error);
        if (result.statusCode === 401) return logout();

        app.entries = result.body.entries;
        app.path = filePath;
        app.pathParts = filePath.split('/').filter(function (e) { return !!e; });
        console.log(app.pathParts)
    });
}

function open(entry) {
    var path = sanitize(app.path + '/' + entry.filePath);

    if (entry.isDirectory) return loadDirectory(path);

    window.location.href = window.location.origin + path;
}

function up() {
    loadDirectory(app.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
}

var app = new Vue({
    el: '#app',
    data: {
        busy: true,
        path: '/',
        pathParts: [],
        session: {
            valid: false
        },
        loginData: {},
        entries: []
    },
    methods: {
        login: login,
        logout: logout,
        loadDirectory: loadDirectory,
        open: open,
        up: up
    }
});

window.app = app;

login(localStorage.username, localStorage.password);

})();
