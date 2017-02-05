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

    superagent.get('/api/files/' + encode(filePath)).query({ username: app.session.username, password: app.session.password }).end(function (error, result) {
        app.busy = false;

        if (result && result.statusCode === 401) return logout();
        if (error) return console.error(error);

        result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
        app.entries = result.body.entries.map(function (entry) {
            entry.previewUrl = getPreviewUrl(entry, filePath);
            return entry;
        });
        app.path = filePath;
        app.pathParts = decode(filePath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
            return {
                name: e,
                link: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
        });

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
    var path = sanitize(app.path + '/' + entry.filePath);

    if (entry.isDirectory) {
        window.location.hash = path;
        return;
    }

    window.open(encode(path));
}

function up() {
    window.location.hash = sanitize(app.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
}

function upload() {
    $(app.$els.upload).on('change', function () {

        // detach event handler
        $(app.$els.upload).off('change');

        app.uploadStatus = {
            busy: true,
            count: app.$els.upload.files.length,
            done: 0,
            percentDone: 0
        };

        function uploadFile(file) {
            var path = encode(sanitize(app.path + '/' + file.name));

            var formData = new FormData();
            formData.append('file', file);

            superagent.put('/api/files' + path).query({ username: app.session.username, password: app.session.password }).send(formData).end(function (error, result) {
                if (result && result.statusCode === 401) return logout();
                if (result && result.statusCode !== 201) console.error('Error uploading file: ', result.statusCode);
                if (error) console.error(error);

                app.uploadStatus.done += 1;
                app.uploadStatus.percentDone = Math.round(app.uploadStatus.done / app.uploadStatus.count * 100);

                console.log(Math.round(app.uploadStatus.done / app.uploadStatus.count * 100))

                if (app.uploadStatus.done >= app.uploadStatus.count) {
                    app.uploadStatus = {
                        busy: false,
                        count: 0,
                        done: 0,
                        percentDone: 100
                    };

                    refresh();
                }
            });
        }

        for(var i = 0; i < app.uploadStatus.count; ++i) {
            uploadFile(app.$els.upload.files[i]);
        }
    });

    // reset the form first to make the change handler retrigger even on the same file selected
    $('#fileUploadForm')[0].reset();

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

        if (result && result.statusCode === 401) return logout();
        if (result && result.statusCode !== 200) return console.error('Error deleting file: ', result.statusCode);
        if (error) return console.error(error);

        refresh();

        $('#modalDelete').modal('hide');
    });
}

function createDirectoryAsk() {
    $('#modalcreateDirectory').modal('show');
    app.createDirectoryData = '';
    app.createDirectoryError = null;
}

function createDirectory(name) {
    app.busy = true;
    app.createDirectoryError = null;

    var path = encode(sanitize(app.path + '/' + name));

    superagent.put('/api/files' + path).query({ username: app.session.username, password: app.session.password, directory: true }).end(function (error, result) {
        app.busy = false;

        if (result && result.statusCode === 401) return logout();
        if (result && result.statusCode === 403) {
            app.createDirectoryError = 'Name not allowed';
            return;
        }
        if (result && result.statusCode === 409) {
            app.createDirectoryError = 'Directory already exists';
            return;
        }
        if (result && result.statusCode !== 201) return console.error('Error creating directory: ', result.statusCode);
        if (error) return console.error(error);

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
        uploadStatus: {
            busy: false,
            count: 0,
            done: 0,
            percentDone: 50
        },
        path: '/',
        pathParts: [],
        session: {
            valid: false
        },
        loginData: {},
        deleteData: {},
        createDirectoryData: '',
        createDirectoryError: null,
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

window.app = app;

login(localStorage.username, localStorage.password);

$(window).on('hashchange', function () {
    loadDirectory(window.location.hash.slice(1));
});

// setup all the dialog focus handling
['modalcreateDirectory'].forEach(function (id) {
    $('#' + id).on('shown.bs.modal', function () {
        $(this).find("[autofocus]:first").focus();
    });
});

})();
