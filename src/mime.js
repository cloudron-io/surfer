'use strict';

import fs from 'fs';

const GLOBS2_FILE = '/usr/share/mime/globs2';

let gTypes = null;

function init() {
    if (gTypes) return;

    console.log(`Loading rich mime-types from ${GLOBS2_FILE}`);

    gTypes = {};

    let glob2;
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

        gTypes[f[2].slice(1)] = f[1];
    });
}

function getMimeType(filePath) {
    if (!gTypes) init();

    const typeKey = Object.keys(gTypes).find(function (type) {
        return filePath.toLowerCase().endsWith(type);
    });

    if (!typeKey) return 'application/octet-stream';

    // ubuntu globs reports application/rtf but collabora wants the correct mimetype of text/rtf
    if (typeKey === '.rtf') return 'text/rtf';

    return gTypes[typeKey];
}

export {
    getMimeType
};

export default init;
