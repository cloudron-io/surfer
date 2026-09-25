'use strict';

import fs from 'node:fs';
import database from './database.js';

export default {
    init,
    publicDirForHost,
    publicDirInUse,
    list,
    insert,
    rowForDomain,
    updateSite,
};

function init(dataDir, primaryDomain, aliasHostnames) {
    const tables = database.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('domains', 'sites')`);
    const names = new Set(tables.map(function (row) { return row.name; }));
    if (names.has('domains') && !names.has('sites')) database.exec('ALTER TABLE domains RENAME TO sites');

    database.exec(`
        CREATE TABLE IF NOT EXISTS sites (
            domain TEXT PRIMARY KEY,
            publicDir TEXT NOT NULL
        );
    `);

    if (primaryDomain) {
        const existing = database.get('SELECT domain FROM sites WHERE domain = ?', [ primaryDomain ]);
        if (!existing) database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ primaryDomain, 'public' ]);
    }

    const aliases = new Set(aliasHostnames || []);
    let entries = [];
    try {
        entries = fs.readdirSync(dataDir, { withFileTypes: true });
    } catch {
        entries = [];
    }

    for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('public-')) continue;
        const hostname = entry.name.slice('public-'.length);
        if (!aliases.has(hostname)) continue;

        const existing = database.get('SELECT domain FROM sites WHERE domain = ?', [ hostname ]);
        if (existing) continue;
        database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ hostname, entry.name ]);
    }
}

function publicDirForHost(host) {
    if (!host) return null;
    const row = database.get('SELECT publicDir FROM sites WHERE domain = ?', [ host ]);
    return row ? row.publicDir : null;
}

function publicDirInUse(publicDir) {
    if (!publicDir) return false;
    return !!database.get('SELECT domain FROM sites WHERE publicDir = ?', [ publicDir ]);
}

function list() {
    return database.all('SELECT domain, publicDir FROM sites ORDER BY publicDir, domain');
}

function insert(domain, publicDir) {
    database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ domain, publicDir ]);
}

function rowForDomain(domain) {
    if (!domain) return null;
    return database.get('SELECT domain, publicDir FROM sites WHERE domain = ?', [ domain ]) || null;
}

function updateSite(fromDomain, fromDir, publicDir, domain) {
    const tx = database.transaction(function () {
        if (publicDir !== fromDir) database.run('UPDATE sites SET publicDir = ? WHERE publicDir = ?', [ publicDir, fromDir ]);
        if (domain !== fromDomain) database.run('UPDATE sites SET domain = ? WHERE domain = ?', [ domain, fromDomain ]);
    });
    tx();
}
