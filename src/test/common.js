import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import database from '../database.js';

let dataDir = '';

function setup() {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surfer-unit-'));
    fs.mkdirSync(path.join(dataDir, 'files'));
    database.init(path.join(dataDir, 'db.sqlite'));
}

function cleanup() {
    if (!dataDir) return;
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = '';
}

function root() {
    return dataDir;
}

export default {
    setup,
    cleanup,
    root,
};
