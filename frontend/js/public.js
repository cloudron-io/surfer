(function () {
    'use strict';

    /* global superagent */
    /* global Vue */
    /* global $ */
    /* global filesize */

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
        video: [ '.mp4', '.mpg', '.mpeg', '.ogg', '.mkv', '.avi', '.mov' ]
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

    function loadDirectory() {
        app.busy = true;

        var filePath = sanitize(window.location.pathname);

        app.path = filePath;
        decode(filePath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
            return {
                name: e,
                link: '#' + sanitize('/' + a.slice(0, i).join('/') + '/' + e)
            };
        });

        superagent.get('/api/files/' + encode(filePath)).query({ access_token: localStorage.accessToken }).end(function (error, result) {
            app.busy = false;

            if (result && result.statusCode === 401) return logout();
            if (error) return console.error(error);

            result.body.entries.sort(function (a, b) { return a.isDirectory && b.isFile ? -1 : 1; });
            app.entries = result.body.entries.map(function (entry) {
                entry.previewUrl = getPreviewUrl(entry, filePath);
                entry.extension = getExtension(entry);
                entry.rename = false;
                entry.filePathNew = entry.filePath;
                return entry;
            });

            app.path = filePath;

            app.pathParts = decode(filePath).split('/').filter(function (e) { return !!e; }).map(function (e, i, a) {
                return {
                    name: e,
                    link: sanitize('/' + a.slice(0, i).join('/') + '/' + e)
                };
            });
        });
    }

    function open(row, column, event) {
        var fullPath = encode(sanitize(app.path + '/' + row.filePath));

        if (row.isDirectory) return window.location.href = fullPath;

        app.activeEntry = row;
        app.activeEntry.fullPath = fullPath;
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

    var app = new Vue({
        el: '#app',
        data: {
            ready: false,
            busy: false,
            path: '',
            pathParts: [],
            previewDrawerVisible: false,
            activeEntry: {},
            entries: []
        },
        methods: {
            onDownload: function (entry) {
                if (entry.isDirectory) return;
                window.location.href = encode('/api/files/' + sanitize(this.path + '/' + entry.filePath)) + '?access_token=' + localStorage.accessToken;
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
            open: open,
            onUp: function () {
                window.location.href = sanitize(this.path.split('/').filter(function (p) { return !!p; }).slice(0, -1).join('/'));
            }
        }
    });

    loadDirectory();
})();