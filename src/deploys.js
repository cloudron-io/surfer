'use strict';

import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import database from './database.js';

const MAX_DEPLOYS = 50;
const MAX_MESSAGE_LENGTH = 1000;

export default {
    init,
    readMessage,
    add,
    get,
};

function init() {
    database.exec(`
        CREATE TABLE IF NOT EXISTS deploys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            username TEXT NOT NULL,
            name TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT ''
        );
    `);

    const columns = database.all('PRAGMA table_info(deploys)');
    if (!columns.some(function (column) { return column.name === 'message'; })) {
        database.exec('ALTER TABLE deploys ADD COLUMN message TEXT NOT NULL DEFAULT \'\'');
    }
}

function badMessage(text) {
    const error = new Error(text);
    error.code = 'EBADMESSAGE';
    return error;
}

function readMessage(req) {
    const raw = req.headers && req.headers['surfer-message'];
    if (raw == null || raw === '') return '';
    if (typeof raw !== 'string') throw badMessage('invalid deploy message');

    const decoded = safe(function () { return decodeURIComponent(raw); });
    if (safe.error) throw badMessage('invalid deploy message');

    const message = decoded.trim();
    if (message.length > MAX_MESSAGE_LENGTH) throw badMessage('deploy message is too long');
    return message;
}

function add(req, message) {
    const user = req.user || {};
    const username = typeof user.username === 'string' ? user.username : '';
    const name = typeof user.name === 'string' ? user.name : (typeof user.displayName === 'string' ? user.displayName : '');
    const note = typeof message === 'string' ? message : '';

    const tx = database.transaction(function () {
        database.run('INSERT INTO deploys (at, username, name, message) VALUES (?, ?, ?, ?)', [ new Date().toISOString(), username, name, note ]);

        const extra = database.all('SELECT id FROM deploys ORDER BY id DESC LIMIT -1 OFFSET ?', [ MAX_DEPLOYS ]);
        for (const row of extra) database.run('DELETE FROM deploys WHERE id = ?', [ row.id ]);
    });
    tx();
}

function list() {
    return database.all('SELECT id, at, username, name, message FROM deploys ORDER BY id DESC');
}

function get(req, res, next) {
    const rows = safe(list);
    if (safe.error) {
        console.error('deploys:', safe.error);
        return next(new HttpError(500, 'failed to list deploys'));
    }

    next(new HttpSuccess(200, rows || []));
}
