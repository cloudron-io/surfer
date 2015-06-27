'use strict';

exports.put = put;
exports.get = get;
exports.del = del;

var superagent = require('superagent'),
    path = require('path');

var server = 'http://localhost:3000/api/files/';

function put(filePath) {
    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.put(server + relativeFilePath).attach('file', filePath).end(function (error, result) {
        if (error) return console.log('Failed', result ? result.body : error);
        console.log('Success', result.body);
    });
}

function get(filePath) {
    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.get(server + relativeFilePath).end(function (error, result) {
        if (error) return console.log('Failed', result ? result.body : error);
        console.log('Success', result.body);
    });
}

function del(filePath) {
    var relativeFilePath = path.resolve(filePath).slice(process.cwd().length + 1);
    superagent.del(server + relativeFilePath).end(function (error, result) {
        if (error) return console.log('Failed', result ? result.body : error);
        console.log('Success', result.body);
    });
}
