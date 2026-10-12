'use strict';

import safe from '@cloudron/safetydance';
import database from './database.js';
import SurferError from './surfererror.js';

const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 1000;

export default {
    init,
    parseMessage,
    add,
    list,
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

async function decode(value) {
    return decodeURIComponent(value);
}

async function parseMessage(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw !== 'string') throw new SurferError(SurferError.BAD_FIELD, 'invalid deploy message');

    const [error, decoded] = await safe(decode(raw));
    if (error) throw new SurferError(SurferError.BAD_FIELD, 'invalid deploy message');

    const message = decoded.trim();
    if (message.length > MAX_MESSAGE_LENGTH) throw new SurferError(SurferError.BAD_FIELD, 'deploy message is too long');
    return message;
}

async function add(user, message, site) {
    const record = user || {};
    const username = typeof record.username === 'string' ? record.username : '';
    const name = typeof record.name === 'string' ? record.name : (typeof record.displayName === 'string' ? record.displayName : '');
    const note = typeof message === 'string' ? message : '';
    const label = typeof site === 'string' && site ? site : 'default';

    const tx = database.transaction(function () {
        database.run('INSERT INTO history (at, username, name, message, site) VALUES (?, ?, ?, ?, ?)', [ new Date().toISOString(), username, name, note, label ]);

        const extra = database.all('SELECT id FROM history ORDER BY id DESC LIMIT -1 OFFSET ?', [ MAX_HISTORY ]);
        for (const row of extra) database.run('DELETE FROM history WHERE id = ?', [ row.id ]);
    });
    tx();
}

async function readRows() {
    return database.all('SELECT id, at, username, name, message, site FROM history ORDER BY id DESC');
}

async function list() {
    const [error, rows] = await safe(readRows());
    if (error) {
        console.error('history:', error);
        throw new SurferError(SurferError.DATABASE_ERROR, 'failed to list history');
    }

    return rows.map(function (row) {
        return { id: row.id, at: row.at, username: row.username, name: row.name, message: row.message, site: row.site || 'default' };
    });
}
