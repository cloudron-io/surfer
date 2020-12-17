(function () {
'use strict';

/* global superagent */
/* global Vue */
/* global $ */
/* global filesize */
/* global message, button, toolbar, inputtext, password, breadcrumb, datatable, column, menu, dialog, checkbox, progressspinner, progressbar */

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

function initWithToken(accessToken) {
    if (!accessToken) {
        app.ready = true;
        return;
    }

    superagent.get('/api/profile').query({ access_token: accessToken }).end(function (error, result) {
        app.ready = true;

        if (error && !error.response) return console.error(error);
        if (result.statusCode !== 200) {
            delete localStorage.accessToken;
            return;
        }

        localStorage.accessToken = accessToken;
        app.session.username = result.body.username;
        app.session.valid = true;

        superagent.get('/api/settings').query({ access_token: localStorage.accessToken }).end(function (error, result) {
            if (error) console.error(error);

            app.settings.folderListingEnabled =  !!result.body.folderListingEnabled;
            app.settings.sortFoldersFirst =  !!result.body.sortFoldersFirst;

            loadDirectory(decode(window.location.hash.slice(1)));

            app.refreshAccessTokens();
        });
    });
}

function sanitize(path) {
    path = '/' + path;
    return path.replace(/\/+/g, '/');
}

function encode(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

function decode(path) {
    return path.split('/').map(decodeURIComponent).join('/');
}

var mimeTypes = {
    images: [ '.png', '.jpg', '.jpeg', '.tiff', '.gif' ],
    text: [ '.txt', '.md' ],
    pdf: [ '.pdf' ],
    html: [ '.html', '.htm', '.php' ],
    music: [ '.mp2', '.mp3', '.ogg', '.flac', '.wav', '.aac' ],
    video: [ '.mp4', '.mpg', '.mpeg', '.mkv', '.avi', '.mov' ]
};

function getPreviewUrl(entry, basePath) {
    var path = '/_admin/img/';

    if (entry.isDirectory) return path + 'directory.png';
    if (mimeTypes.images.some(function (e) { return entry.fileName.endsWith(e); })) return sanitize(basePath + '/' + entry.fileName);
    if (mimeTypes.text.some(function (e) { return entry.fileName.endsWith(e); })) return path +'text.png';
    if (mimeTypes.pdf.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'pdf.png';
    if (mimeTypes.html.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'html.png';
    if (mimeTypes.music.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'music.png';
    if (mimeTypes.video.some(function (e) { return entry.fileName.endsWith(e); })) return path + 'video.png';

    return path + 'unknown.png';
}

// simple extension detection, does not work with double extension like .tar.gz
function getExtension(entry) {
    if (entry.isFile) return entry.fileName.slice(entry.fileName.lastIndexOf('.') + 1);
    return '';
}

function refresh() {
    loadDirectory(app.path);
}

function logout() {
    superagent.post('/api/logout').query({ access_token: localStorage.accessToken }).end(function (error) {
        if (error) console.error(error);

        // close all potential dialogs
        app.newFolderDialog.visible = false;
        app.settingsDialog.visible = false;
        app.accessTokenDialog.visible = false;

        app.loginData.username = '';
        app.loginData.password = '';
        app.loginData.error = false;

        app.session.valid = false;

        delete localStorage.accessToken;
    });
}

function loadDirectory(folderPath) {
    app.busy = true;

    folderPath = folderPath ? sanitize(folderPath) : '/';

    superagent.get('/api/files/' + encode(folderPath)).query({ access_token: localStorage.accessToken }).end(function (error, result) {
        app.busy = false;

        if (result && result.statusCode === 401) return logout();
        if (error) return console.error(error);

        result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
        app.entries = result.body.entries.map(function (entry) {
            entry.previewUrl = getPreviewUrl(entry, folderPath);
            entry.extension = getExtension(entry);
            entry.rename = false;
            entry.filePathNew = entry.fileName;
            return entry;
        });
        app.path = folderPath;
        app.breadCrumbs.items = decode(folderPath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
            return {
                label: e,
                url: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
        });

        // update in case this was triggered from code
        window.location.hash = app.path;
    });
}

function open(entry) {
    // ignore item open on entry clicks if we are renaming this entry
    if (entry.rename) return;

    var path = sanitize(app.path + '/' + entry.fileName);

    if (entry.isDirectory) {
        window.location.hash = path;
        return;
    }

    app.activeEntry = entry;
    app.activeEntry.fullPath = encode(sanitize(app.path + '/' + entry.fileName));
    app.previewDrawerVisible = true

    // need to wait for DOM element to exist
    setTimeout(function () {
        $('iframe').on('load', function (e) {
            if (!e.target.contentWindow.document.body) return;

            e.target.contentWindow.document.body.style.display = 'flex'
            e.target.contentWindow.document.body.style.justifyContent = 'center'
        });
    }, 0);
}

function uploadFiles(files) {
    if (!files || !files.length) return;

    app.uploadStatus.busy = true;
    app.uploadStatus.count = files.length;
    app.uploadStatus.size = 0;
    app.uploadStatus.done = 0;
    app.uploadStatus.percentDone = 0;

    for (var i = 0; i < files.length; ++i) {
        app.uploadStatus.size += files[i].size;
    }

    asyncForEach(files, function (file, callback) {
        var path = encode(sanitize(app.path + '/' + (file.webkitRelativePath || file.name)));

        var formData = new FormData();
        formData.append('file', file);

        var finishedUploadSize = app.uploadStatus.done;

        superagent.post('/api/files' + path)
          .query({ access_token: localStorage.accessToken })
          .send(formData)
          .on('progress', function (event) {
            // only handle upload events
            if (!(event.target instanceof XMLHttpRequestUpload)) return;

            app.uploadStatus.done = finishedUploadSize + event.loaded;
            var tmp = Math.round(app.uploadStatus.done / app.uploadStatus.size * 100);
            app.uploadStatus.percentDone = tmp > 100 ? 100 : tmp;
        }).end(function (error, result) {
            if (result && result.statusCode === 401) return logout();
            if (result && result.statusCode !== 201) return callback('Error uploading file: ', result.statusCode);
            if (error) return callback(error);

            callback();
        });
    }, function (error) {
        if (error) console.error(error);

        app.uploadStatus.busy = false;
        app.uploadStatus.count = 0;
        app.uploadStatus.size = 0;
        app.uploadStatus.done = 0;
        app.uploadStatus.percentDone = 100;

        refresh();
    });
}

function dragOver(event) {
    event.stopPropagation();
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}

function drop(event) {
    event.stopPropagation();
    event.preventDefault();

    if (!event.dataTransfer.items[0]) return;

    // figure if a folder was dropped on a modern browser, in this case the first would have to be a directory
    var folderItem;
    try {
        folderItem = event.dataTransfer.items[0].webkitGetAsEntry();
        if (folderItem.isFile) return uploadFiles(event.dataTransfer.files);
    } catch (e) {
        return uploadFiles(event.dataTransfer.files);
    }

    // if we got here we have a folder drop and a modern browser
    // now traverse the folder tree and create a file list
    app.uploadStatus.busy = true;
    app.uploadStatus.uploadListCount = 0;

    var fileList = [];
    function traverseFileTree(item, path, callback) {
        if (item.isFile) {
            // Get file
            item.file(function (file) {
                fileList.push(file);
                ++app.uploadStatus.uploadListCount;
                callback();
            });
        } else if (item.isDirectory) {
            // Get folder contents
            var dirReader = item.createReader();
            dirReader.readEntries(function (entries) {
                asyncForEach(entries, function (entry, callback) {
                    traverseFileTree(entry, path + item.name + '/', callback);
                }, callback);
            });
        }
    }

    traverseFileTree(folderItem, '', function (error) {
        app.uploadStatus.busy = false;
        app.uploadStatus.uploadListCount = 0;

        if (error) return console.error(error);

        uploadFiles(fileList);
    });
}

var app = Vue.createApp({
    data() {
        return {
            ready: false,
            busy: false,
            origin: window.location.origin,
            domain: window.location.host,
            uploadStatus: {
                busy: false,
                count: 0,
                done: 0,
                percentDone: 50,
                uploadListCount: 0
            },
            path: '/',
            breadCrumbs: {
                home: { icon: 'pi pi-home', url: '#/' },
                items: []
            },
            session: {
                valid: false
            },
            loginData: {
                busy: false,
                error: false,
                username: '',
                password: ''
            },
            previewDrawerVisible: false,
            activeEntry: {},
            entries: [],
            accessTokens: [],
            // only for current session
            sort: {
                prop: 'fileName',
                desc: true
            },
            // holds settings values stored on backend
            settings: {
                folderListingEnabled: false,
                sortFoldersFirst: false
            },
            settingsDialog: {
                visible: false,
                busy: false,
                // settings copy for modification
                folderListingEnabled: false,
                sortFoldersFirst: false
            },
            accessTokenDialog: {
                visible: false,
            },
            newFolderDialog: {
                visible: false,
                error: '',
                folderName: ''
            },
            mainMenu: [{
                label: 'Settings',
                icon: 'pi pi-cog',
                command: this.openSettingsDialog
            }, {
                label: 'Access Tokens',
                icon: 'pi pi-key',
                command: this.openAccessTokenDialog
            }, {
                separator: true
            }, {
                label: 'About',
                icon: 'pi pi-info-circle'
            }, {
                label: 'Logout',
                icon: 'pi pi-sign-out',
                command: logout
            }]
        }
    },
    components: {
        'p-button': button,
        'p-toolbar': toolbar,
        'p-inputtext': inputtext,
        'p-password': password,
        'p-breadcrumb': breadcrumb,
        'p-datatable': datatable,
        'p-column': column,
        'p-menu': menu,
        'p-dialog': dialog,
        'p-checkbox': checkbox,
        'p-progressspinner': progressspinner,
        'p-progressbar': progressbar,
        'p-message': message,
    },
    computed: {
        filteredAndSortedEntries: function () {
            var that = this;

            function sorting(list) {
                var tmp = list.sort(function (a, b) {
                    return (a[that.sort.prop] < b[that.sort.prop]) ? -1 : 1;
                });

                if (that.sort.desc) return tmp;
                return tmp.reverse();
            }

            if (this.settings.sortFoldersFirst) {
                return sorting(this.entries.filter(function (e) { return e.isDirectory; })).concat(sorting(this.entries.filter(function (e) { return !e.isDirectory; })));
            } else {
                return sorting(this.entries);
            }
        }
    },
    methods: {
        toggleMenu: function (event) {
            this.$refs.menu.toggle(event);
        },
        openNewFolderDialog: function () {
            this.newFolderDialog.error = '';
            this.newFolderDialog.folderName = '';
            this.newFolderDialog.visible = true;
        },
        onSaveNewFolderDialog: function () {
            var that = this;

            var path = encode(sanitize(this.path + '/' + this.newFolderDialog.folderName));

            superagent.post('/api/files' + path).query({ access_token: localStorage.accessToken, directory: true }).end(function (error, result) {
                if (result && result.statusCode === 401) return logout();
                if (result && result.statusCode === 403) return that.newFolderDialog.error = 'Folder name not allowed';
                if (result && result.statusCode === 409) return that.newFolderDialog.error = 'Folder already exists';
                if (result && result.statusCode !== 201) return that.newFolderDialog.error = 'Error creating folder: ' + result.statusCode;
                if (error) return console.error(error.message);

                refresh();

                that.newFolderDialog.visible = false;
            });
        },
        openAccessTokenDialog: function () {
            this.accessTokenDialog.visible = true;
        },
        openSettingsDialog: function () {
            this.settingsDialog.folderListingEnabled = this.settings.folderListingEnabled;
            this.settingsDialog.sortFoldersFirst = this.settings.sortFoldersFirst;
            this.settingsDialog.visible = true;
        },
        onSaveSettingsDialog: function () {
            var that = this;

            this.settingsDialog.busy = true;

            // save here
            var data = {
                folderListingEnabled: this.settingsDialog.folderListingEnabled,
                sortFoldersFirst: this.settingsDialog.sortFoldersFirst
            };

            superagent.put('/api/settings').send(data).query({ access_token: localStorage.accessToken }).end(function (error) {
                if (error) return console.error(error);

                // after success, copy to app
                that.settings.folderListingEnabled = data.folderListingEnabled;
                that.settings.sortFoldersFirst = data.sortFoldersFirst;

                that.settingsDialog.busy = false;
                that.settingsDialog.visible = false;
            });
        },
        onLogin: function () {
            var that = this;

            that.loginData.busy = true;
            that.loginData.error = false;

            superagent.post('/api/login').send({ username: that.loginData.username, password: that.loginData.password }).end(function (error, result) {
                that.loginData.busy = false;

                if (error || result.statusCode === 401) {
                    that.loginData.error = true;
                    that.loginData.password = '';
                    document.getElementById('passwordInput').focus();
                    return;
                }

                initWithToken(result.body.accessToken);
            });
        },
        onOptionsMenu: function (command, source) {
            if (command === 'folderListing') {
                superagent.put('/api/settings').send({ folderListingEnabled: this.settings.folderListingEnabled }).query({ access_token: localStorage.accessToken }).end(function (error) {
                    if (error) console.error(error);
                });
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
                // now hide the menu
                source.$parent.$parent.hide();

                logout();
            }
        },
        onDownload: function (entry) {
            if (entry.isDirectory) return;
            window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.fileName)) + '?access_token=' + localStorage.accessToken;
        },
        onUpload: function () {
            var that = this;

            $(this.$refs.upload).on('change', function () {
                // detach event handler
                $(that.$refs.upload).off('change');
                uploadFiles(that.$refs.upload.files || []);
            });

            // reset the form first to make the change handler retrigger even on the same file selected
            this.$refs.upload.value = '';
            this.$refs.upload.click();
        },
        onUploadFolder: function () {
            var that = this;

            $(this.$refs.uploadFolder).on('change', function () {
                // detach event handler
                $(that.$refs.uploadFolder).off('change');
                uploadFiles(that.$refs.uploadFolder.files || []);
            });

            // reset the form first to make the change handler retrigger even on the same file selected
            this.$refs.uploadFolder.value = '';
            this.$refs.uploadFolder.click();
        },
        onDelete: function (entry) {
            var that = this;

            var title = 'Really delete ' + (entry.isDirectory ? 'folder ' : '') + entry.fileName;
            this.$confirm('', title, { confirmButtonText: 'Yes', cancelButtonText: 'No' }).then(function () {
                var path = encode(sanitize(that.path + '/' + entry.fileName));

                superagent.del('/api/files' + path).query({ access_token: localStorage.accessToken, recursive: true }).end(function (error, result) {
                    if (result && result.statusCode === 401) return logout();
                    if (result && result.statusCode !== 200) return that.$message.error('Error deleting file: ' + result.statusCode);
                    if (error) return that.$message.error(error.message);

                    refresh();
                });
            }).catch(function () {});
        },
        onRename: function (entry) {
            if (entry.rename) return entry.rename = false;

            entry.filePathNew = entry.fileName;
            entry.rename = true;

            Vue.nextTick(function () {
                var elem = document.getElementById('filePathRenameInputId-' + entry.fileName);
                elem.focus();

                if (typeof elem.selectionStart != "undefined") {
                    elem.selectionStart = 0;
                    elem.selectionEnd = entry.fileName.lastIndexOf('.');
                }
            });
        },
        onRenameEnd: function (entry) {
            entry.rename = false;
        },
        onRenameSubmit: function (entry) {
            var that = this;

            entry.rename = false;

            if (entry.filePathNew === entry.fileName) return;

            var path = encode(sanitize(this.path + '/' + entry.fileName));
            var newFilePath = sanitize(this.path + '/' + entry.filePathNew);

            superagent.put('/api/files' + path).query({ access_token: localStorage.accessToken }).send({ newFilePath: newFilePath }).end(function (error, result) {
                if (result && result.statusCode === 401) return logout();
                if (result && result.statusCode !== 200) return that.$message.error('Error renaming file: ' + result.statusCode);
                if (error) return that.$message.error(error.message);

                entry.fileName = entry.filePathNew;
            });
        },
        refreshAccessTokens: function () {
            var that = this;

            superagent.get('/api/tokens').query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                that.accessTokens = result.body.accessTokens;
            });
        },
        onCopyAccessToken: function (event) {
            event.target.select();
            document.execCommand('copy');
        },
        onCreateAccessToken: function () {
            var that = this;

            superagent.post('/api/tokens').query({ access_token: localStorage.accessToken }).end(function (error, result) {
                if (error && !result) return that.$message.error(error.message);

                that.refreshAccessTokens();
            });
        },
        onDeleteAccessToken: function (token) {
            var that = this;

            this.$confirm('All actions from apps using this token will fail!', 'Really delete this access token?', { confirmButtonText: 'Yes Delete', cancelButtonText: 'No' }).then(function () {
                superagent.delete('/api/tokens/' + token).query({ access_token: localStorage.accessToken }).end(function (error, result) {
                    if (error && !result) return that.$message.error(error.message);

                    that.refreshAccessTokens();
                });
            }).catch(function () {});

        },
        prettyDate: function (cellValue) {
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
        prettyFileSize: function (cellValue) {
            return filesize(cellValue);
        },
        loadDirectory: loadDirectory,
        onUp: function () {
            window.location.hash = sanitize(this.path.split('/').slice(0, -1).filter(function (p) { return !!p; }).join('/'));
        },
        onEntryOpen: function (entry) {
            // ignore item open on row clicks if we are renaming this entry
            if (entry.rename) return;

            var path = sanitize(this.path + '/' + entry.fileName);

            if (entry.isDirectory) {
                window.location.hash = path;
                return;
            }

            this.activeEntry = entry;
            this.activeEntry.fullPath = encode(sanitize(this.path + '/' + entry.fileName));
            this.previewDrawerVisible = true

            // need to wait for DOM element to exist
            setTimeout(function () {
                $('iframe').on('load', function (e) {
                    if (!e.target.contentWindow.document.body) return;

                    e.target.contentWindow.document.body.style.display = 'flex'
                    e.target.contentWindow.document.body.style.justifyContent = 'center'
                });
            }, 0);
        },
        open: open,
        drop: drop,
        dragOver: dragOver
    }
});

app.directive('tooltip', tooltip);
app = app.mount('#app');

initWithToken(localStorage.accessToken);

$(window).on('hashchange', function () {
    loadDirectory(decode(window.location.hash.slice(1)));
});

})();
