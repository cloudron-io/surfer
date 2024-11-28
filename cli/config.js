'use strict';

import fs from 'fs';
import path from 'path';
import safe from 'safetydance';
import _ from 'underscore';

const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
const CONFIG_FILE_PATH = path.join(HOME, '.surfer.json');

export default {
    clear,
    set,
    get,
    unset,
    has,

    filePath: CONFIG_FILE_PATH,

    // convenience
    server: function () { return get('server'); },
    accessToken: function () { return get('accessToken'); }
};

var gConfig = (function () {
    return safe.JSON.parse(safe.fs.readFileSync(CONFIG_FILE_PATH)) || {};
})();

function save() {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(gConfig, null, 4));
}

function clear() {
    safe.fs.unlinkSync(CONFIG_FILE_PATH);
}

function set(key, value) {
    if (typeof key === 'object') {
        _.extend(gConfig, key);
    } else {
        safe.set(gConfig, key, value);
    }
    save();
}

function get(key) {
    return safe.query(gConfig, key);
}

function unset(key /*, .... */) {
    for (var i = 0; i < arguments.length; i++) {
        gConfig = safe.unset(gConfig, arguments[i]);
    }

    save();
}

function has(key /*, ... */) {
    for (var i = 0; i < arguments.length; i++) {
        if (!(arguments[i] in gConfig)) return false;
    }
    return true;
}
