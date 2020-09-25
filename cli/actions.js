'use strict';

exports.login = login;
exports.logout = logout;
exports.put = put;
exports.get = get;
exports.del = del;
exports.syncUp = syncUp;
exports.syncDown = syncDown;

var superagent = require('superagent'),
    config = require('./config.js'),
    readlineSync = require('readline-sync'),
    safe = require('safetydance'),
    async = require('async'),
    fs = require('fs'),
    request = require('request'),
    url = require('url'),
    path = require('path');

require('colors');

var API = '/api/files/';

var gServer = '';
var gQuery = {};

function checkConfig(options) {
    if (!options.parent.server && !config.server()) {
        console.log('Run %s first, or provide %s', 'surfer login'.bold, '--server <url>'.bold);
        process.exit(1);
    }

    if (options.parent.server) {
        var tmp = url.parse(options.parent.server);
        if (!tmp.slashes) tmp = url.parse('https://' + options.parent.server);
        gServer = tmp.protocol + '//' + tmp.host;
    } else {
        gServer = config.server();
    }

    if (!options.parent.token && !config.accessToken()) {
        console.log('Run %s first or provide %s', 'surfer login'.bold, '--token <access token>'.bold);
        process.exit(1);
    }

    gQuery = { access_token: options.parent.token || config.accessToken() };

    console.error('Using server %s', gServer.cyan);
}

function collectFiles(filePath, basePath, options) {
    var tmp = [];

    var absoluteFilePath = path.resolve(basePath, filePath);

    var fileName = path.basename(absoluteFilePath);
    if (!options.all && fileName[0] === '.' && fileName.length > 1) return;

    var stat = fs.statSync(absoluteFilePath);

    var file = {
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        atime: stat.atime.toISOString(),
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        birthtime: stat.birthtime,
        size: stat.size,
        fileName: fileName,
        filePath: absoluteFilePath.slice(basePath.length), // this is relative to basePath
        absoluteFilePath: absoluteFilePath
    };

    if (stat.isFile()) {
        tmp.push(file);
    } else if (stat.isDirectory()) {
        tmp.push(file);

        fs.readdirSync(absoluteFilePath).forEach(function (fileName) {
            tmp = tmp.concat(collectFiles(path.join(absoluteFilePath, fileName), basePath, options));
        });
    } else {
        console.log('Skipping %s', filePath.cyan);
    }

    return tmp;
}

function login(uri, options) {
    var tmp = url.parse(uri);
    if (!tmp.slashes) tmp = url.parse('https://' + uri);

    var server = tmp.protocol + '//' + tmp.host;

    console.log('Using server', server.cyan);

    var username = options.username || readlineSync.question('Username: ');
    var password = options.password || readlineSync.question('Password: ', { hideEchoBack: true, mask: '' });

    if (!username || !password) process.exit(1);

    superagent.post(server + '/api/login').send({ username: username, password: password }).end(function (error, result) {
        if (error && error.code === 'ENOTFOUND') {
            console.log('Server %s not found.'.red, server.bold);
            process.exit(1);
        }
        if (error && error.code) {
            console.log('Failed to connect to server %s'.red, server.bold, error.code);
            process.exit(1);
        }
        if (result.status !== 201) {
            console.log('Login failed.\n'.red);

            // remove the password to avoid a login loop
            delete options.password;

            return login(uri, options);
        }

        // TODO remove at some point, this is just to clear the previous old version values
        config.set('username', '');
        config.set('password', '');

        config.set('server', server);
        config.set('accessToken', result.body.accessToken);

        console.log('Login successful'.green);
    });
}

function logout() {
    if (!config.accessToken()) return console.log('Done'.green);

    superagent.post(gServer + '/api/logout').query({ access_token: config.accessToken() }).end(function (error, result) {
        if (result && result.statusCode !== 200) console.log('Failed to logout: ' + result.statusCode);
        if (error) console.log(error);

        // TODO remove at some point, this is just to clear the previous old version values
        config.set('username', '');
        config.set('password', '');
        config.set('server', '');
        config.set('accessToken', '');

        console.log('Done'.green);
    });
}

function putOne(file, destination, callback) {
    let destinationPath = path.join(destination, file.filePath);

    if (file.isFile) {
        console.log('Uploading %s -> %s', file.filePath.cyan, destinationPath.cyan);

        superagent.post(gServer + path.join(API, encodeURIComponent(destinationPath))).query(gQuery).attach('file', file.absoluteFilePath).end(function (error, result) {
            if (result && result.statusCode === 403) return callback(new Error('Destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error uploading file: ' + result.statusCode));
            if (error) return callback(error);

            callback(null);
        });
    } else if (file.isDirectory) {
        console.log('Creating directory %s', destinationPath.cyan);

        var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
        query.directory = true;

        superagent.post(gServer + path.join(API, encodeURIComponent(destinationPath))).query(query).end(function (error, result) {
            if (result && result.statusCode === 409) return callback(null); // already exists, fine
            if (result && result.statusCode === 403) return callback(new Error('Destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error creating directory: ' + result.statusCode));
            if (error) return callback(error);

            callback(null);
        });
    } else {
        callback(); // ignore
    }
}

function delOne(file, callback) {
    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    if (file.isDirectory) query.recursive = true;

    superagent.del(gServer + path.join(API, encodeURIComponent(file.filePath))).query(query).end(function (error, result) {
        if (error && error.status === 401) return callback('Login failed');
        if (error && error.status === 404) return callback(null); // file already removed
        if (error && error.status === 403) return callback('Failed. Target is a directory. Use %s to delete directories.', '--recursive'.yellow);
        if (error) return callback('Failed %s', result ? result.body : error);

        callback(null);
    });
}

function put(filePaths, options) {
    checkConfig(options);

    if (filePaths.length < 2) {
        console.log('target directory is required.'.red);
        process.exit(1);
    }

    let destination = filePaths.pop();
    if (!path.isAbsolute(destination)) {
        console.log('target directory must be absolute'.red);
        process.exit(1);
    }
    if (!destination.endsWith('/')) destination += '/';

    var files = [];
    filePaths.forEach(function (filePath) {
        var absoluteFilePath = path.resolve(process.cwd(), filePath);
        var baseFilePath = path.dirname(absoluteFilePath);

        files = files.concat(collectFiles(absoluteFilePath, baseFilePath, options));
    });

    async.eachLimit(files, 10, (file, iteratorDone) => putOne(file, destination, iteratorDone), function (error) {
        if (error) {
            console.log('Failed to upload file.', error.message.red);
            process.exit(1);
        }

        console.log('Done');
    });
}

function get(filePath, options) {
    checkConfig(options);

    // if no argument provided, fetch root
    filePath = filePath || '/';

    request.get(gServer + path.join(API, encodeURIComponent(filePath)), { qs: gQuery }, function (error, result, body) {
        if (result && result.statusCode === 401) return console.log('Login failed');
        if (result && result.statusCode === 404) return console.log('No such file or directory %s', filePath.yellow);
        if (error) return console.error(error);

        // 222 indicates directory listing
        if (result.statusCode === 222) {
            var files = safe.JSON.parse(body);
            if (!files || files.entries.length === 0) {
                console.log('No files on the server. Use %s to upload some.', 'surfer put <file>'.yellow);
            } else {
                console.log('Entries:');
                files.entries.forEach(function (entry) {
                    console.log('\t %s', entry.isDirectory ? entry.filePath + '/' : entry.filePath);
                });
            }
        } else {
            process.stdout.write(body);
        }
    });
}

function del(filePath, options) {
    checkConfig(options);

    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = options.recursive;
    query.dryRun = options.dryRun;

    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.del(gServer + path.join(API, encodeURIComponent(relativeFilePath))).query(query).end(function (error, result) {
        if (error && error.status === 401) return console.log('Login failed'.red);
        if (error && error.status === 404) return console.log('No such file or directory');
        if (error && error.status === 403) return console.log('Failed. Target is a directory. Use %s to delete directories.', '--recursive'.yellow);
        if (error) return console.log('Failed', result ? result.body : error);

        if (options.dryRun) {
            console.log('This would remove %s files:', result.body.entries.length);
            result.body.entries.forEach(function (entry) {
                console.log('\t %s', entry);
            });
        } else {
            console.log('Success. Removed %s files.', result.body.entries.length);
        }
    });
}

function syncUp(src, dest, options) {
    checkConfig(options);

    var absoluteSrcPath = path.resolve(process.cwd(), src);
    var absoluteDestPath = dest || '.';

    // if src is a directory, we want to upload the directory itself
    var stat = fs.statSync(absoluteSrcPath);
    if (stat.isDirectory()) {
        absoluteDestPath = path.normalize(path.join('/', dest, src));
    }

    console.log('Syncing local ', absoluteSrcPath, ' -> remote ', absoluteDestPath);

    var localFiles = collectFiles(absoluteSrcPath, absoluteSrcPath, options);
    var remoteFiles = [];

    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = true;

    superagent.get(gServer + path.join(API, absoluteDestPath)).query(query).end(function (error, result) {
        if (error) {
            if (error.status === 401) return console.log('Login failed');
            if (error.status !== 404) return console.error(error);

            // 404 means remote not found so upload all
            remoteFiles = [];
        } else {
            // 222 indicates directory listing
            if (result.statusCode !== 222) {
                console.error('Destination is not a directory. Cannot continue.');
                process.exit(1);
            }

            remoteFiles = result.body.entries;

            // add the remote folder details itself
            remoteFiles.push(result.body.stat);
        }

        var remoteFileList = remoteFiles.map(function (f) { return f.filePath; });
        var localFileList = localFiles.map(function (f) { return path.join(absoluteDestPath, f.filePath); });

        // find new local files
        var newLocalFiles = localFileList.filter(function (p) { return remoteFileList.indexOf(p) === -1; });

        // find removed local files
        var removedLocalFiles = remoteFileList.filter(function (p) { return localFileList.indexOf(p) === -1; });

        // first removing remote files
        async.eachLimit(removedLocalFiles, 10, function (filePath, callback) {
            console.log(`Removing ${filePath.cyan}`);

            var file = remoteFiles.find(function (f) { return f.filePath === filePath; });
            if (!file) return callback(`File not found ${filePath}`);

            delOne(file, callback);
        }, function (error) {
            if (error) return console.error('Failed', error);

            // now upload new files
            async.eachLimit(newLocalFiles, 10, function (filePath, callback) {
                var file = localFiles.find(function (f) { return path.join(absoluteDestPath, f.filePath) === filePath; });
                if (!file) return callback(`File not found ${filePath}`);

                putOne(file, absoluteDestPath, callback);
            }, function (error) {
                if (error) return console.error('Failed', error);

                console.log('Done');
            });
        });
    });
}

function syncDown(src, dest, options) {
    checkConfig(options);

    dest = dest || '.';

    console.log('remote ', src, ' -> local ', dest);

    var localFiles = collectFiles([ dest ], { all: true });
    console.log(localFiles)
}
