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

        loadDirectory(window.location.hash.slice(1));
    });
}

function logout() {
    app.session.valid = false;
    app.session.username = null;
    app.session.password = null;

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

function decode(filePath) {
    return filePath.split('/').map(decodeURIComponent).join('/');
}

var mimeTypes = {
    images: [ '.png', '.jpg', '.jpeg', '.tiff', '.gif' ],
    text: [ '.txt', '.md' ],
    pdf: [ '.pdf' ],
    html: [ '.html', '.htm', '.php' ],
    video: [ '.mp4', '.mpg', '.mpeg', '.ogg', '.mkv' ]
};

function getPreviewUrl(entry, basePath) {
    var path = '/_admin/img/';

    if (entry.isDirectory) return path + 'directory.png';
    if (mimeTypes.images.some(function (e) { return entry.filePath.endsWith(e); })) return sanitize(basePath + '/' + entry.filePath);
    if (mimeTypes.text.some(function (e) { return entry.filePath.endsWith(e); })) return path +'text.png';
    if (mimeTypes.pdf.some(function (e) { return entry.filePath.endsWith(e); })) return path + 'pdf.png';
    if (mimeTypes.html.some(function (e) { return entry.filePath.endsWith(e); })) return path + 'html.png';
    if (mimeTypes.video.some(function (e) { return entry.filePath.endsWith(e); })) return path + 'video.png';

    return path + 'unknown.png';
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

        result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
        app.entries = result.body.entries.map(function (entry) {
            entry.previewUrl = getPreviewUrl(entry, filePath);
            return entry;
        });
        app.path = filePath;
        app.pathParts = decode(filePath).split('/').filter(function (e) { return !!e; });

        // update in case this was triggered from code
        window.location.hash = app.path;

        Vue.nextTick(function () {
            $(function () {
                $('[data-toggle="tooltip"]').tooltip();
            });
        });
    });
}

function open(entry) {
    var path = encode(sanitize(app.path + '/' + entry.filePath));

    if (entry.isDirectory) {
        window.location.hash = path;
        return;
    }

    window.open(path);
}

function up() {
    window.location.hash = encode(sanitize(app.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/')));
}

function upload() {
    $(app.$els.upload).on('change', function () {
        app.busy = true;

        // detach event handler
        $(app.$els.upload).off('change');

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

function delAsk(entry) {
    $('#modalDelete').modal('show');
    app.deleteData = entry;
}

function del(entry) {
    app.busy = true;

    var path = encode(sanitize(app.path + '/' + entry.filePath));

    superagent.del('/api/files' + path).query({ username: app.session.username, password: app.session.password, recursive: true }).end(function (error, result) {
        app.busy = false;

        if (error) return console.error(error);
        if (result.statusCode !== 200) return console.error('Error deleting file: ', result.statusCode);

        refresh();

        $('#modalDelete').modal('hide');
    });
}

function createDirectoryAsk() {
    $('#modalcreateDirectory').modal('show');
    app.createDirectoryData = '';
}

function createDirectory(name) {
    app.busy = true;

    var path = encode(sanitize(app.path + '/' + name));

    superagent.put('/api/files' + path).query({ username: app.session.username, password: app.session.password, directory: true }).end(function (error, result) {
        app.busy = false;

        if (error) return console.error(error);
        if (result.statusCode !== 201) return console.error('Error creating directory: ', result.statusCode);

        app.createDirectoryData = '';
        refresh();

        $('#modalcreateDirectory').modal('hide');
    });
}

Vue.filter('prettyDate', function (value) {
    var d = new Date(value);
    return d.toDateString();
});

Vue.filter('prettyFileSize', function (value) {
    return filesize(value);
});

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
        deleteData: {},
        createDirectoryData: '',
        entries: []
    },
    methods: {
        login: login,
        logout: logout,
        loadDirectory: loadDirectory,
        open: open,
        up: up,
        upload: upload,
        delAsk: delAsk,
        del: del,
        createDirectoryAsk: createDirectoryAsk,
        createDirectory: createDirectory
    }
});

login(localStorage.username, localStorage.password);

$(window).on('hashchange', function () {
    loadDirectory(window.location.hash.slice(1));
});

})();
