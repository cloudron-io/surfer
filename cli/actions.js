'use strict';

exports.login = login;
exports.put = put;
exports.get = get;
exports.del = del;

var superagent = require('superagent'),
    config = require('./config.js'),
    readlineSync = require('readline-sync'),
    async = require('async'),
    fs = require('fs'),
    url = require('url'),
    path = require('path');

require('colors');

var API = '/api/files/';

var gQuery = {};

function checkConfig() {
    if (!config.server() || !config.username() || !config.password()) {
        console.log('You have run "login" first');
        process.exit(1);
    }

    gQuery = { username: config.username(), password: config.password() };

    console.log('Using server %s', config.server().yellow);
}

function collectFiles(filesOrFolders) {
    var tmp = [];

    filesOrFolders.forEach(function (filePath) {
        var stat = fs.statSync(filePath);

        if (stat.isFile()) {
            tmp.push(filePath);
        } else if (stat.isDirectory()) {
            var files = fs.readdirSync(filePath).map(function (file) { return path.join(filePath, file); });
            tmp = tmp.concat(collectFiles(files));
        } else {
            console.log('Skipping %s', filePath.cyan);
        }
    });

    return tmp;
}

function login(uri) {
    var tmp = url.parse(uri);
    if (!tmp.host) tmp = url.parse('https://' + uri);

    var server = tmp.protocol + '//' + tmp.host;

    console.log('Using server', server.bold);

    var username = readlineSync.question('Username: ', { hideEchoBack: false });
    var password = readlineSync.question('Password: ', { hideEchoBack: true });

    superagent.get(server + API + '/').query({ username: username, password: password }).end(function (error, result) {
        if (error && error.code === 'ENOTFOUND') {
            console.log('No such server %s'.red, server.bold);
            process.exit(1);
        }
        if (error.code) {
            console.log('Failed to connect to server %s'.red, server.bold, error.code);
            process.exit(1);
        }
        if (result.status === 401) {
            console.log('Login failed.'.red);
            process.exit(1);
        }

        config.set('server', server);
        config.set('username', username);

        // TODO this is clearly bad and needs fixing
        config.set('password', password);

        gQuery = { username: username, password: password };

        console.log('Ok'.green);
    });
}

function put(filePath, otherFilePaths, options) {
    checkConfig();

    var files = collectFiles([ filePath ].concat(otherFilePaths));

    async.eachSeries(files, function (file, callback) {
        var relativeFilePath = path.resolve(file).slice(process.cwd().length + 1);

        console.log('Uploading file %s -> %s', relativeFilePath.cyan, ((options.destination ? options.destination : '') + '/' + relativeFilePath).cyan);

        superagent.put(config.server() + API + relativeFilePath).query(gQuery).attach('file', file).end(callback);
    }, function (error) {
        if (error) {
            console.log('Failed to put file.', error);
            process.exit(1);
        }

        console.log('Done');
    });
}

function get(filePath) {
    checkConfig();

    superagent.get(config.server() + API + filePath).query(gQuery).end(function (error, result) {
        if (error && error.status === 401) return console.log('Login failed');
        if (error && error.status === 404) return console.log('No such file or directory');
        if (error) return console.log('Failed', result ? result.body : error);

        if (result.body && result.body.entries) {
            console.log('Files:');
            result.body.entries.forEach(function (entry) {
                console.log('\t %s', entry);
            });
        } else {
            console.log(result.text);
        }
    });
}

function del(filePath) {
    checkConfig();

    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.del(config.server() + API + relativeFilePath).query(gQuery).end(function (error, result) {
        if (error && error.status === 401) return console.log('Login failed');
        if (error && error.status === 404) return console.log('No such file or directory');
        if (error) return console.log('Failed', result ? result.body : error);
        console.log('Success', result.body);
    });
}
