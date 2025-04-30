'use strict';

import fs from 'fs';

const GLOBS2_FILE = '/usr/share/mime/globs2';

// to override OTHER text types to text/plain
const COMMON_TEXT_TYPES = [
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

export default function (express) {
    console.log(`Loading rich mime-types from ${GLOBS2_FILE}`);

    let glob2;
    const types = {};

    try {
        glob2 = fs.readFileSync(GLOBS2_FILE, 'utf8');
    } catch (e) {
        console.log('Failed to load globs2 file. Using built-in media-types.', e);
        return;
    }

    // we reverse the list to keep priorities correct
    glob2.split('\n').reverse().forEach(function (line) {
        if (line.startsWith('#')) return;

        const f = line.split(':');
        if (f.length <= 1) return;

        let type = f[1];

        if (type.startsWith('text/') && COMMON_TEXT_TYPES.indexOf(type) === -1) type = 'text/plain';

        if (!types[type]) types[type] = [];
        types[type].push(f[2].slice(2));
    });

    Object.keys(types).forEach(function (type) {
        const obj = {};
        obj[type] = types[type];

        // express.static.mime.define(obj);
    });
};
