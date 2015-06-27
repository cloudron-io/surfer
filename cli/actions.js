'use strict';

exports.login = login;
exports.put = put;
exports.get = get;
exports.del = del;

var superagent = require('superagent'),
    config = require('./config'),
    async = require('async'),
    fs = require('fs'),
    path = require('path');

require('colors');

var API = '/api/files/';

function checkConfig() {
    if (!config.server()) {
        console.log('You have run "login" first');
        process.exit(1);
    }
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

function login(server) {
    console.log('Using server', server);
    config.set('server', server);
}

function put(filePath, otherFilePaths) {
    checkConfig();

    var files = collectFiles([ filePath ].concat(otherFilePaths));

    async.eachSeries(files, function (file, callback) {
        var relativeFilePath = path.resolve(file).slice(process.cwd().length + 1);

        console.log('Uploading file %s', relativeFilePath.cyan);

        superagent.put(config.server() + API + relativeFilePath).attach('file', file).end(callback);
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

    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.get(config.server() + API + relativeFilePath).end(function (error, result) {
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
    superagent.del(config.server() + API + relativeFilePath).end(function (error, result) {
        if (error) return console.log('Failed', result ? result.body : error);
        console.log('Success', result.body);
    });
}
