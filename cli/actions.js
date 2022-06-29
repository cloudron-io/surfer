'use strict';

exports.login = login;
exports.logout = logout;
exports.put = put;
exports.get = get;
exports.del = del;

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

function exit(errorArgs) {
    if (errorArgs) {
        console.error.apply(console, arguments);
        process.exit(1);
    }

    process.exit(0);
}

function checkConfig(options, program) {
    // FIXME this uses private API of commander. I was not able to figure out how to otherwise access program wide args
    let parentOptions = program.parent._optionValues;

    if (!parentOptions.server && !config.server()) exit('Run %s first, or provide %s', 'surfer login'.bold, '--server <url>'.bold);

    if (parentOptions.server) {
        var tmp = url.parse(parentOptions.server);
        if (!tmp.slashes) tmp = url.parse('https://' + parentOptions.server);
        gServer = tmp.protocol + '//' + tmp.host;
    } else {
        gServer = config.server();
    }

    if (!parentOptions.token && !config.accessToken()) exit('Run %s first or provide %s', 'surfer login'.bold, '--token <access token>'.bold);

    gQuery = { access_token: parentOptions.token || config.accessToken() };

    console.log('Using server %s', gServer.cyan);
}

function collectFiles(filePath, basePath, options) {
    var tmp = [];

    var absoluteFilePath = path.resolve(basePath, filePath);

    var fileName = path.basename(absoluteFilePath);
    if (!options.all && fileName[0] === '.' && fileName.length > 1) return [];

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

    if (!username || !password) exit('Provide username and password');

    superagent.post(server + '/api/login').send({ username: username, password: password }).end(function (error, result) {
        if (error && error.code === 'ENOTFOUND') exit('Server %s not found.'.red, server.bold);
        if (error && error.code) exit('Failed to connect to server %s'.red, server.bold, error.code);
        if (result.status !== 201) {
            console.log('Login failed.\n'.red);

            // remove the password to avoid a login loop
            delete options.password;

            return login(uri, options);
        }

        config.set('server', server);
        config.set('accessToken', result.body.accessToken);

        console.log('Login successful'.green);
    });
}

function logout() {
    if (!config.accessToken()) return console.log('Done'.green);

    superagent.post(gServer + '/api/logout').query({ access_token: config.accessToken() }).end(function (error, result) {
        if (result && result.statusCode !== 200) exit('Failed to logout: ' + result.statusCode);
        if (error) exit(error.message);

        config.set('server', '');
        config.set('accessToken', '');

        console.log('Done'.green);
    });
}

function putOne(file, destination, callback) {
    let destinationPath = path.join(destination, file.filePath);

    if (file.isFile) {
        console.log('Uploading %s -> %s', file.filePath.cyan, destinationPath.cyan);

        superagent.post(gServer + path.join(API, encodeURIComponent(destinationPath))).query(gQuery).attach('file', file.absoluteFilePath).field('mtime', file.mtime).end(function (error, result) {
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
        if (error && error.status === 404) return callback(null, []); // file already removed
        if (error && error.status === 403) return callback('Failed. Target is a directory. Use --recursive to delete directories.');
        if (error) return callback('Failed %s', result ? result.body : error);

        callback(null, result.body.entries);
    });
}

function get(filePath, options, program) {
    checkConfig(options, program);

    // if no argument provided, fetch root
    filePath = filePath || '/';

    request.get(gServer + path.join(API, encodeURIComponent(filePath)), { qs: gQuery }, function (error, result, body) {
        if (result && result.statusCode === 401) exit('Login failed');
        if (result && result.statusCode === 404) exit('No such file or directory %s', filePath.yellow);
        if (error) exit(error.message);

        // 222 indicates directory listing
        if (result.statusCode === 222) {
            var files = safe.JSON.parse(body);
            if (!files || files.entries.length === 0) {
                console.log('Empty directory. Use %s to upload some.', 'surfer put <file>'.yellow);
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

function del(filePath, options, program) {
    checkConfig(options, program);

    // construct a virtual file for further use
    var file = {
        filePath: filePath,
        isDirectory: !!options.recursive
    };

    if (filePath === '/') {
        if (!options.recursive) exit('To delete all files --recursive is required.'.yellow);
        if (!options.yes && !readlineSync.keyInYN('Really delete all files?')) exit();
    }

    delOne(file, function (error, result) {
        if (error) exit(error.red);
        else console.log('Success. Removed %s entries.', result.length);
    });
}

function legacyPut(filePaths, options) {
    console.log('Server is on older version, falling back to old behavior.'.yellow);

    let destination = filePaths.pop();
    if (!path.isAbsolute(destination)) exit('target directory must be absolute'.red);
    if (!destination.endsWith('/')) destination += '/';

    var files = [];
    filePaths.forEach(function (filePath) {
        var absoluteFilePath = path.resolve(process.cwd(), filePath);
        var baseFilePath = path.dirname(absoluteFilePath);

        files = files.concat(collectFiles(absoluteFilePath, baseFilePath, options));
    });

    async.eachLimit(files, 10, (file, iteratorDone) => putOne(file, destination, iteratorDone), function (error) {
        if (error) exit('Failed to upload file.', error.message.red);

        console.log('Done');
    });
}

function put(filePaths, options, program) {
    checkConfig(options, program);

    if (filePaths.length < 2) exit('Target directory argument is required'.red);

    let absoluteDestPath = filePaths.pop();
    if (!path.isAbsolute(absoluteDestPath)) exit('Target directory must be absolute, starting with /'.red);
    if (!absoluteDestPath.endsWith('/')) absoluteDestPath += '/';

    var localFiles = [];
    filePaths.forEach(function (filePath) {
        var absoluteFilePath = path.resolve(process.cwd(), filePath);
        var baseFilePath = path.dirname(absoluteFilePath);

        localFiles = localFiles.concat(collectFiles(absoluteFilePath, baseFilePath, options));
    });

    var remoteFiles = [];

    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = true;

    superagent.get(gServer + path.join(API, absoluteDestPath)).query(query).end(function (error, result) {
        if (error) {
            if (error.status === 401) exit('Login failed');
            if (error.status !== 404) exit(error.message);

            // 404 means remote not found so upload all
            remoteFiles = [];
        } else {
            // 222 indicates directory listing
            if (result.statusCode !== 222) exit('Destination is not a directory. Cannot continue.');

            // TODO this is just to keep old version supported for some time
            if (!result.body.stat) {
                filePaths.push(absoluteDestPath);
                return legacyPut(filePaths, options);
            }

            remoteFiles = result.body.entries;
        }

        // we need to find below two lists of files for syncing
        var newLocalFiles = [];
        var remoteFilesNotLocalAnymore = [];

        // find new local files
        newLocalFiles = localFiles.filter(function (local) {
            return !remoteFiles.find(function (remote) {
                if (remote.filePath !== path.join(absoluteDestPath, local.filePath)) return false;
                if (local.isDirectory) return true;

                if (remote.mtime !== local.mtime) return false;
                if (remote.size !== local.size) return false;

                return true;
            });
        }).map(function (f) { return path.join(absoluteDestPath, f.filePath); });

        // find removed local files if --delete flag passed
        if (options.delete) remoteFilesNotLocalAnymore = remoteFiles.filter(function (remote) {
            return !localFiles.find(function (local) {
                return remote.filePath === path.join(absoluteDestPath, local.filePath);
            });
        });

        // first purging remote files
        async.eachLimit(remoteFilesNotLocalAnymore, 10, function (remoteFile, callback) {
            console.log(`Removing ${remoteFile.filePath.cyan}`);

            var file = remoteFiles.find(function (f) { return f.filePath === remoteFile.filePath; });
            if (!file) return callback(`File not found ${remoteFile.filePath}`);

            delOne(file, callback);
        }, function (error) {
            if (error) return exit(error.message);

            // now upload new files
            async.eachLimit(newLocalFiles, 10, function (filePath, callback) {
                var file = localFiles.find(function (f) { return path.join(absoluteDestPath, f.filePath) === filePath; });
                if (!file) return callback(`File not found ${filePath}`);

                putOne(file, absoluteDestPath, callback);
            }, function (error) {
                if (error) exit(error.message);

                console.log('Done');
            });
        });
    });
}
