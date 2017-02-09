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

var gQuery = {};

function checkConfig() {
    if (!config.server() || !config.accessToken()) {
        console.log('Run %s first', 'surfer login'.yellow);
        process.exit(1);
    }

    gQuery = { access_token: config.accessToken() };

    console.error('Using server %s', config.server().cyan);
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

    superagent.post(config.server() + '/api/logout').query({ access_token: config.accessToken() }).end(function (error, result) {
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

function put(filePath, otherFilePaths, options) {
    checkConfig();

    var destination = '';

    // take the last argument as destination
    if (otherFilePaths.length > 0) {
        destination = otherFilePaths.pop();
        if (otherFilePaths.length > 0 && destination[destination.length-1] !== '/') destination += '/';
    }

    var files = collectFiles([ filePath ].concat(otherFilePaths), options);

    async.eachSeries(files, function (file, callback) {
        var relativeFilePath;

        if (path.isAbsolute(file)) {
            relativeFilePath = path.basename(file);
        } else if (path.resolve(file).indexOf(process.cwd()) === 0) { // relative to current dir
            relativeFilePath = path.resolve(file).slice(process.cwd().length + 1);
        } else { // relative but somewhere else
            relativeFilePath = path.basename(file);
        }

        var destinationPath = (destination ? '/' + destination : '') + '/' + relativeFilePath;
        console.log('Uploading file %s -> %s', relativeFilePath.cyan, destinationPath.cyan);

        superagent.post(config.server() + API + destinationPath).query(gQuery).attach('file', file).end(function (error, result) {
            if (result && result.statusCode === 403) return callback(new Error('Upload destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error uploading file: ' + result.statusCode));
            if (error) return callback(error);

            console.log('Uploaded to ' + config.server() + destinationPath);

            callback(null);
        });
    }, function (error) {
        if (error) {
            console.log('Failed to put file.', error.message.red);
            process.exit(1);
        }

        console.log('Done');
    });
}

function get(filePath) {
    checkConfig();

    // if no argument provided, fetch root
    filePath = filePath || '/';

    request.get(config.server() + API + filePath, { qs: gQuery }, function (error, result, body) {
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
    // var req = superagent.get(config.server() + API + filePath);
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
    checkConfig();

    var query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = options.recursive;
    query.dryRun = options.dryRun;

    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.del(config.server() + API + relativeFilePath).query(query).end(function (error, result) {
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
