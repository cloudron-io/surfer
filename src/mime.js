'use strict';

var fs = require('fs');

var GLOBS2_FILE = '/usr/share/mime/globs2';

exports = module.exports = function (express) {
    console.log(`Loading rich mime-types from ${GLOBS2_FILE}`);

    var glob2;
    var types = {};

    try {
        glob2 = fs.readFileSync(GLOBS2_FILE, 'utf8');
    } catch (e) {
        console.log('Failed to load globs2 file. Using built-in media-types.');
        return;
    }

    // we reverse the list to keep priorities correct
    glob2.split('\n').reverse().forEach(function (line) {
        if (line.startsWith('#')) return;

        var f = line.split(':');
        if (f.length <= 1) return;

        if (!types[f[1]]) types[f[1]] = [];
        types[f[1]].push(f[2].slice(2));
    });

    Object.keys(types).forEach(function (type) {
        var obj = {};
        obj[type] = types[type];

        express.static.mime.define(obj);
    });
};
