'use strict';

import fs from 'node:fs';
import database from './database.js';

export default {
    init,
    publicDirForHost,
    list,
    insert,
    remove,
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
            publicDir TEXT NOT NULL UNIQUE
        );
    `);

    if (primaryDomain) {
        const existing = database.get('SELECT domain FROM sites WHERE domain = ?', [ primaryDomain ]);
        if (!existing) {
            const owner = database.get('SELECT domain FROM sites WHERE publicDir = ?', [ 'public' ]);
            if (!owner) database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ primaryDomain, 'public' ]);
            else database.run('UPDATE sites SET domain = ? WHERE domain = ?', [ primaryDomain, owner.domain ]);
        }
    }

    const aliases = new Set(aliasHostnames || []);
    let entries;
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
        const dirUsed = database.get('SELECT domain FROM sites WHERE publicDir = ?', [ entry.name ]);
        if (dirUsed) continue;
        database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ hostname, entry.name ]);
    }

    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS sites_publicDir ON sites(publicDir)');
}

function publicDirForHost(host) {
    if (!host) return null;
    const row = database.get('SELECT publicDir FROM sites WHERE domain = ?', [ host ]);
    return row ? row.publicDir : null;
}

function list() {
    return database.all('SELECT domain, publicDir FROM sites ORDER BY publicDir, domain');
}

function insert(domain, publicDir) {
    database.run('INSERT INTO sites (domain, publicDir) VALUES (?, ?)', [ domain, publicDir ]);
}

function remove(domain) {
    database.run('DELETE FROM sites WHERE domain = ?', [ domain ]);
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
