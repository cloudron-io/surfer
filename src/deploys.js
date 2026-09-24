'use strict';

import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import database from './database.js';

const MAX_DEPLOYS = 50;

export default {
    init,
    add,
    get,
};

function init() {
    database.exec(`
        CREATE TABLE IF NOT EXISTS deploys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            username TEXT NOT NULL,
            name TEXT NOT NULL
        );
    `);
}

function add(req) {
    const user = req.user || {};
    const username = typeof user.username === 'string' ? user.username : '';
    const name = typeof user.name === 'string' ? user.name : (typeof user.displayName === 'string' ? user.displayName : '');

    const tx = database.transaction(function () {
        database.run('INSERT INTO deploys (at, username, name) VALUES (?, ?, ?)', [ new Date().toISOString(), username, name ]);

        const extra = database.all('SELECT id FROM deploys ORDER BY id DESC LIMIT -1 OFFSET ?', [ MAX_DEPLOYS ]);
        for (const row of extra) database.run('DELETE FROM deploys WHERE id = ?', [ row.id ]);
    });
    tx();
}

function list() {
    return database.all('SELECT id, at, username, name FROM deploys ORDER BY id DESC');
}

function get(req, res, next) {
    const rows = safe(list);
    if (safe.error) {
        console.error('deploys:', safe.error);
        return next(new HttpError(500, 'failed to list deploys'));
    }

    next(new HttpSuccess(200, rows || []));
}
