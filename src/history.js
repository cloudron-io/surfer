'use strict';

import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import database from './database.js';

const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 1000;

export default {
    init,
    readMessage,
    add,
    get,
};

function init() {
    const tables = database.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('deploys', 'history')`);
    const names = new Set(tables.map(function (row) { return row.name; }));

    if (names.has('deploys') && !names.has('history')) {
        const columns = database.all('PRAGMA table_info(deploys)');
        if (!columns.some(function (column) { return column.name === 'message'; })) {
            database.exec(`ALTER TABLE deploys ADD COLUMN message TEXT NOT NULL DEFAULT ''`);
        }
        if (!columns.some(function (column) { return column.name === 'site' || column.name === 'deployment'; })) {
            database.exec(`ALTER TABLE deploys ADD COLUMN site TEXT NOT NULL DEFAULT ''`);
        }
        database.exec('ALTER TABLE deploys RENAME TO history');
    }

    database.exec(`
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            username TEXT NOT NULL,
            name TEXT NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            site TEXT NOT NULL DEFAULT ''
        );
    `);

    const columns = database.all('PRAGMA table_info(history)');
    if (!columns.some(function (column) { return column.name === 'message'; })) {
        database.exec(`ALTER TABLE history ADD COLUMN message TEXT NOT NULL DEFAULT ''`);
    }
    if (columns.some(function (column) { return column.name === 'deployment'; }) && !columns.some(function (column) { return column.name === 'site'; })) {
        database.exec('ALTER TABLE history RENAME COLUMN deployment TO site');
    } else if (!columns.some(function (column) { return column.name === 'site'; })) {
        database.exec(`ALTER TABLE history ADD COLUMN site TEXT NOT NULL DEFAULT ''`);
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

function add(req, message, site) {
    const user = req.user || {};
    const username = typeof user.username === 'string' ? user.username : '';
    const name = typeof user.name === 'string' ? user.name : (typeof user.displayName === 'string' ? user.displayName : '');
    const note = typeof message === 'string' ? message : '';
    const label = typeof site === 'string' && site ? site : 'default';

    const tx = database.transaction(function () {
        database.run('INSERT INTO history (at, username, name, message, site) VALUES (?, ?, ?, ?, ?)', [ new Date().toISOString(), username, name, note, label ]);

        const extra = database.all('SELECT id FROM history ORDER BY id DESC LIMIT -1 OFFSET ?', [ MAX_HISTORY ]);
        for (const row of extra) database.run('DELETE FROM history WHERE id = ?', [ row.id ]);
    });
    tx();
}

function list() {
    const rows = database.all('SELECT id, at, username, name, message, site FROM history ORDER BY id DESC');
    return rows.map(function (row) {
        return { id: row.id, at: row.at, username: row.username, name: row.name, message: row.message, site: row.site || 'default' };
    });
}

function get(req, res, next) {
    const rows = safe(list);
    if (safe.error) {
        console.error('history:', safe.error);
        return next(new HttpError(500, 'failed to list history'));
    }

    next(new HttpSuccess(200, rows || []));
}
