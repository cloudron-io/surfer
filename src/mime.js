'use strict';

var fs = require('fs');

var GLOBS2_FILE = '/usr/share/mime/globs2';

// to override OTHER text types to text/plain
var COMMON_TEXT_TYPES = [
    'text/calendar',
    'text/comma',
    'text/css',
    'text/html',
    'text/javascript',
    'text/plain',
    'text/richtext',
    'text/rtf',
    'text/xml'
];

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

        var type = f[1];

        if (type.startsWith('text/') && COMMON_TEXT_TYPES.indexOf(type) === -1) type = 'text/plain';

        if (!types[type]) types[type] = [];
        types[type].push(f[2].slice(2));
    });

    Object.keys(types).forEach(function (type) {
        var obj = {};
        obj[type] = types[type];

        express.static.mime.define(obj);
    });

};
