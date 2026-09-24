'use strict';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const NOT_INITIALIZED = 'Database not initialized. Call database.init() at startup.';

let db = null;

export default {
    init,
    get,
    all,
    run,
    exec,
    transaction,
};

function init(dbPath) {
    if (db) return;

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
}

function get(sql, params = []) {
    assert(db, NOT_INITIALIZED);
    return db.prepare(sql).get(...params);
}

function all(sql, params = []) {
    assert(db, NOT_INITIALIZED);
    return db.prepare(sql).all(...params);
}

function run(sql, params = []) {
    assert(db, NOT_INITIALIZED);
    return db.prepare(sql).run(...params);
}

function exec(sql) {
    assert(db, NOT_INITIALIZED);
    return db.exec(sql);
}

function transaction(fn) {
    assert(db, NOT_INITIALIZED);
    return db.transaction(fn);
}
