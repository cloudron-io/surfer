(function () {
'use strict';

// poor man's async
function asyncForEach(items, handler, callback) {
    var cur = 0;

    if (items.length === 0) return callback();

    (function iterator() {
        handler(items[cur], function (error) {
            if (error) return callback(error);
            if (cur >= items.length-1) return callback();
            ++cur;

            iterator();
        });
    })();
}

function getProfile(accessToken, callback) {
    callback = callback || function (error) { if (error) console.error(error); };

    superagent.get('/api/profile').query({ access_token: accessToken }).end(function (error, result) {
        app.busy = false;
        app.ready = true;

        if (error && !error.response) return callback(error);
        if (result.statusCode !== 200) {
            delete localStorage.accessToken;
            return callback('Invalid access token');
        }

        localStorage.accessToken = accessToken;
        app.session.username = result.body.username;
        app.session.valid = true;

        callback();
    });
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

// simple extension detection, does not work with double extension like .tar.gz
function getExtension(entry) {
    if (entry.isFile) return entry.filePath.slice(entry.filePath.lastIndexOf('.') + 1);
    return '';
}

function refresh() {
    loadDirectory(app.path);
}

function loadDirectory(filePath) {
    app.busy = true;

    filePath = filePath ? sanitize(filePath) : '/';

    superagent.get('/api/files/' + encode(filePath)).query({ access_token: localStorage.accessToken }).end(function (error, result) {
        app.busy = false;

        if (result && result.statusCode === 401) return logout();
        if (error) return console.error(error);

        result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
        app.entries = result.body.entries.map(function (entry) {
            entry.previewUrl = getPreviewUrl(entry, filePath);
            entry.extension = getExtension(entry);
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
    });
}

function open(row, event, column) {
    var path = sanitize(app.path + '/' + row.filePath);

    if (row.isDirectory) {
        window.location.hash = path;
        return;
    }

    window.open(encode(path));
}

function up() {
    window.location.hash = sanitize(app.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
}

function uploadFiles(files) {
    if (!files || !files.length) return;

    app.uploadStatus.busy = true;
    app.uploadStatus.count = files.length;
    app.uploadStatus.done = 0;
    app.uploadStatus.percentDone = 0;

    asyncForEach(files, function (file, callback) {
        var path = encode(sanitize(app.path + '/' + file.name));

        var formData = new FormData();
        formData.append('file', file);

        superagent.post('/api/files' + path).query({ access_token: localStorage.accessToken }).send(formData).end(function (error, result) {
            if (result && result.statusCode === 401) return logout();
            if (result && result.statusCode !== 201) return callback('Error uploading file: ', result.statusCode);
            if (error) return callback(error);

            app.uploadStatus.done += 1;
            app.uploadStatus.percentDone = Math.round(app.uploadStatus.done / app.uploadStatus.count * 100);

            callback();
        });
    }, function (error) {
        if (error) console.error(error);

        app.uploadStatus.busy = false;
        app.uploadStatus.count = 0;
        app.uploadStatus.done = 0;
        app.uploadStatus.percentDone = 100;

        refresh();
    });
}

function dragOver(event) {
    event.preventDefault();
}

function drop(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files || []);
}

var app = new Vue({
    el: '#app',
    data: {
        ready: false,
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
        folderListingEnabled: false,
        loginData: {
            username: '',
            password: ''
        },
        entries: []
    },
    methods: {
        onLogin: function () {
            app.busy = true;

            superagent.post('/api/login').send({ username: app.loginData.username, password: app.loginData.password }).end(function (error, result) {
                app.busy = false;

                if (error) return console.error(error);
                if (result.statusCode === 401) return console.error('Invalid credentials');

                getProfile(result.body.accessToken, function (error) {
                    if (error) return console.error(error);

                    loadDirectory(window.location.hash.slice(1));
                });
            });
        },
        onOptionsMenu: function (command) {
            if (command === 'folderListing') {
                console.log('Not implemented');
            } else if (command === 'about') {
                this.$msgbox({
                    title: 'About Surfer',
                    message: 'Surfer is a static file server written by <a href="https://cloudron.io" target="_blank">Cloudron</a>.<br/><br/>The source code is licensed under MIT and available <a href="https://git.cloudron.io/cloudron/surfer" target="_blank">here</a>.',
                    dangerouslyUseHTMLString: true,
                    confirmButtonText: 'OK',
                    showCancelButton: false,
                    type: 'info',
                    center: true
                  }).then(function () {}).catch(function () {});
            } else if (command === 'logout') {
                superagent.post('/api/logout').query({ access_token: localStorage.accessToken }).end(function (error) {
                    if (error) console.error(error);

                    app.session.valid = false;

                    delete localStorage.accessToken;
                });
            }
        },
        onDownload: function (entry) {
            if (entry.isDirectory) return;
            window.location.href = encode('/api/files/' + sanitize(app.path + '/' + entry.filePath)) + '?access_token=' + localStorage.accessToken;
        },
        onUpload: function () {
            $(app.$refs.upload).on('change', function () {

                // detach event handler
                $(app.$refs.upload).off('change');

                uploadFiles(app.$refs.upload.files || []);
            });

            // reset the form first to make the change handler retrigger even on the same file selected
            app.$refs.upload.value = '';
            app.$refs.upload.click();
        },
        onDelete: function (entry) {
            var title = 'Really delete ' + (entry.isDirectory ? 'folder ' : '') + entry.filePath;
            this.$confirm('', title, { confirmButtonText: 'Yes', cancelButtonText: 'No' }).then(function () {
                var path = encode(sanitize(app.path + '/' + entry.filePath));

                superagent.del('/api/files' + path).query({ access_token: localStorage.accessToken, recursive: true }).end(function (error, result) {
                    if (result && result.statusCode === 401) return logout();
                    if (result && result.statusCode !== 200) return console.error('Error deleting file: ', result.statusCode);
                    if (error) return console.error(error);

                    refresh();
                });
            }).catch(function () {
                console.log('delete error:', arguments);
            });
        },
        onRename: function (entry) {
            var title = 'Rename ' + entry.filePath;
            this.$prompt('', title, { confirmButtonText: 'Yes', cancelButtonText: 'No', inputPlaceholder: 'new filename', inputValue: entry.filePath }).then(function (data) {
                var path = encode(sanitize(app.path + '/' + entry.filePath));
                var newFilePath = sanitize(app.path + '/' + data.value);

                superagent.put('/api/files' + path).query({ access_token: localStorage.accessToken }).send({ newFilePath: newFilePath }).end(function (error, result) {
                    if (result && result.statusCode === 401) return logout();
                    if (result && result.statusCode !== 200) return console.error('Error renaming file: ', result.statusCode);
                    if (error) return console.error(error);

                    refresh();
                });
            }).catch(function () {
                console.log('rename error:', arguments);
            });
        },
        onNewFolder: function () {
            var title = 'Create New Folder';
            this.$prompt('', title, { confirmButtonText: 'Yes', cancelButtonText: 'No', inputPlaceholder: 'new foldername' }).then(function (data) {
                var path = encode(sanitize(app.path + '/' + data.value));

                superagent.post('/api/files' + path).query({ access_token: localStorage.accessToken, directory: true }).end(function (error, result) {
                    if (result && result.statusCode === 401) return logout();
                    if (result && result.statusCode === 403) return console.error('Name not allowed');
                    if (result && result.statusCode === 409) return console.error('Directory already exists');
                    if (result && result.statusCode !== 201) return console.error('Error creating directory: ', result.statusCode);
                    if (error) return console.error(error);

                    refresh();
                });
            }).catch(function () {
                console.log('create folder error:', arguments);
            });
        },
        prettyDate: function (row, column, cellValue, index) {
            var date = new Date(cellValue),
            diff = (((new Date()).getTime() - date.getTime()) / 1000),
            day_diff = Math.floor(diff / 86400);

            if (isNaN(day_diff) || day_diff < 0)
                return;

            return day_diff === 0 && (
                diff < 60 && 'just now' ||
                diff < 120 && '1 minute ago' ||
                diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
                diff < 7200 && '1 hour ago' ||
                diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
                day_diff === 1 && 'Yesterday' ||
                day_diff < 7 && day_diff + ' days ago' ||
                day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago' ||
                day_diff < 365 && Math.round( day_diff / 30 ) +  ' months ago' ||
                Math.round( day_diff / 365 ) + ' years ago';
        },
        prettyFileSize: function (row, column, cellValue, index) {
            return filesize(cellValue);
        },
        loadDirectory: loadDirectory,
        up: up,
        open: open,
        drop: drop,
        dragOver: dragOver
    }
});

getProfile(localStorage.accessToken, function (error) {
    if (error) return console.error(error);

    loadDirectory(window.location.hash.slice(1));
});

$(window).on('hashchange', function () {
    loadDirectory(window.location.hash.slice(1));
});

})();
