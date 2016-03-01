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

function encode(filePath) {
    return filePath.split('/').map(encodeURIComponent).join('/');
}

function refresh() {
    loadDirectory(app.path);
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
    });
}

function open(entry) {
    var path = sanitize(app.path + '/' + entry.filePath);

    if (entry.isDirectory) return loadDirectory(path);

    window.open(path);
}

function up() {
    loadDirectory(app.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
}

function upload() {
    $(app.$els.upload).change(function () {
        app.busy = true;

        var file = app.$els.upload.files[0];
        var path = encode(sanitize(app.path + '/' + file.name));

        var formData = new FormData();
        formData.append('file', file);

        superagent.put('/api/files' + path).query({ username: app.session.username, password: app.session.password }).send(formData).end(function (error, result) {
            app.busy = false;

            if (error) return console.error(error);
            if (result.statusCode !== 201) return console.error('Error uploading file: ', result.statusCode);

            refresh();
        });
    });

    app.$els.upload.click();
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
        up: up,
        upload: upload
    }
});

window.app = app;

login(localStorage.username, localStorage.password);

})();
