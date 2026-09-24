'use strict';

import path from 'node:path';
import safe from '@cloudron/safetydance';
import database from './database.js';

const DEFAULTS = {
    folderListingEnabled: false,
    title: 'Surfer',
    index: '',
    accessRestriction: '',
    accessPassword: '',
    accessPasswordSalt: '',
};

export default {
    init,
    load,
    save,
};

function init(dbPath) {
    database.init(dbPath);
    database.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    const count = database.get('SELECT COUNT(*) AS count FROM settings').count;
    if (count === 0) {
        const legacyPaths = [ path.join(path.dirname(dbPath), '.surfer.json') ];
        if (path.resolve(dbPath) === path.resolve(import.meta.dirname, '..', 'db.sqlite')) legacyPaths.push(path.resolve(import.meta.dirname, '..', '.config.json'));

        let legacy = null;
        for (const legacyPath of legacyPaths) {
            legacy = readLegacy(legacyPath);
            if (legacy) break;
        }

        if (legacy) {
            console.log(`Migrating settings from ${legacy.path}`);
            save(normalize(legacy.parsed));
            if (!safe.fs.unlinkSync(legacy.path)) console.error(`Cannot remove legacy settings ${legacy.path}`, safe.error);
        }
    }

    const tx = database.transaction(function () {
        for (const key of Object.keys(DEFAULTS)) {
            const existing = database.get('SELECT key FROM settings WHERE key = ?', [key]);
            if (existing) continue;
            database.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, storedValue(key, DEFAULTS[key])]);
        }
    });
    tx();
}

function load() {
    const rows = database.all('SELECT key, value FROM settings');
    const values = {};
    for (const row of rows) values[row.key] = row.value;

    return normalize(values);
}

function save(config) {
    const normalized = normalize(config);
    const tx = database.transaction(function () {
        for (const key of Object.keys(DEFAULTS)) {
            database.run(`
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `, [key, storedValue(key, normalized[key])]);
        }
    });
    tx();
}

function readLegacy(filePath) {
    const raw = safe.fs.readFileSync(filePath, 'utf8');
    if (typeof raw !== 'string') {
        if (safe.error && safe.error.code !== 'ENOENT') console.error(`Cannot read legacy settings ${filePath}`, safe.error);
        return null;
    }

    const parsed = safe.JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        if (safe.error) console.error(`Cannot parse legacy settings ${filePath}`, safe.error);
        return null;
    }

    return { path: filePath, parsed };
}

function normalize(values) {
    const folderListing = values.folderListingEnabled;
    return {
        folderListingEnabled: folderListing === true || folderListing === 'true',
        title: typeof values.title === 'string' ? values.title : DEFAULTS.title,
        index: typeof values.index === 'string' ? values.index : DEFAULTS.index,
        accessRestriction: typeof values.accessRestriction === 'string' ? values.accessRestriction : DEFAULTS.accessRestriction,
        accessPassword: typeof values.accessPassword === 'string' ? values.accessPassword : DEFAULTS.accessPassword,
        accessPasswordSalt: typeof values.accessPasswordSalt === 'string' ? values.accessPasswordSalt : DEFAULTS.accessPasswordSalt,
    };
}

function storedValue(key, value) {
    if (key === 'folderListingEnabled') return value ? 'true' : 'false';
    return value;
}
