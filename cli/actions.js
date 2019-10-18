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

function collectFiles(filesOrFolders, options) {
    var tmp = [];

    filesOrFolders.forEach(function (filePath) {
        var baseName = path.basename(filePath);
        if (!options.all && baseName[0] === '.' && baseName.length > 1) return;

        var stat = fs.statSync(filePath);

        if (stat.isFile()) {
            tmp.push(filePath);
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(filePath).map(function (file) { return path.join(filePath, file); });
            tmp = tmp.concat(collectFiles(files, options));
        } else {
            console.log('Skipping %s', filePath.cyan);
        }
    });

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

function putOne(filePath, destination, options, callback) {
    const absoluteFilePath = path.resolve(filePath);
    const stat = safe.fs.statSync(absoluteFilePath);
    if (!stat) return callback(`Could not stat ${filePath}: ${safe.error.message}`);

    let files, base;

    if (stat.isFile()) {
        base = destination + path.basename(filePath);
        files = [ absoluteFilePath ];
    } else if (stat.isDirectory()) {
        base = destination + (filePath.endsWith('.') ? '' : path.basename(filePath) + '/');
        files = collectFiles([ absoluteFilePath ], options);
    } else {
        return callback(); // ignore
    }

    async.eachSeries(files, function (file, callback) {
        let relativeFilePath = file.slice(absoluteFilePath.length + 1); // will be '' when filePath is a file
        let destinationPath = base + relativeFilePath;
        console.log('Uploading file %s -> %s', file.cyan, destinationPath.cyan);

        superagent.post(gServer + API + destinationPath).query(gQuery).attach('file', file).end(function (error, result) {
            if (result && result.statusCode === 403) return callback(new Error('Upload destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error uploading file: ' + result.statusCode));
            if (error) return callback(error);

            console.log('Uploaded to ' + gServer + destinationPath);

            callback(null);
        });
    }, callback);
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

    async.eachSeries(filePaths, (filePath, iteratorDone) => putOne(filePath, destination, options, iteratorDone), function (error) {
        if (error) {
            console.log('Failed to put file.', error.message.red);
            process.exit(1);
        }

        console.log('Done');
    });
}

function get(filePath, options) {
    checkConfig(options);

    // if no argument provided, fetch root
    filePath = filePath || '/';

    request.get(gServer + API + filePath, { qs: gQuery }, function (error, result, body) {
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
    // var req = superagent.get(gServer + API + filePath);
    // req.query(gQuery);
    // req.end(function (error, result) {
    //     if (error && error.status === 401) return console.log('Login failed');
    //     if (error && error.status === 404) return console.log('No such file or directory');
    //     if (error) return console.log('Failed', result ? result.body : error);

    //     if (result.body && result.body.entries) {
    //         console.log('Files:');
    //         result.body.entries.forEach(function (entry) {
    //             console.log('\t %s', entry);
    //         });
    //     } else {
    //         req.pipe(process.stdout);
    //     }
    // });
}

function del(filePath, options) {
    checkConfig(options);

    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = options.recursive;
    query.dryRun = options.dryRun;

    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.del(gServer + API + relativeFilePath).query(query).end(function (error, result) {
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
