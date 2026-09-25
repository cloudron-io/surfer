'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import deploys from './deploys.js';
import sites from './sites.js';

const gDeployFolder = path.join(sites.dataDir, '.deploy');

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;

const REJECTED_TYPES = new Set([ 'SymbolicLink', 'Link', 'CharacterDevice', 'BlockDevice', 'FIFO', 'GNUDumpDir' ]);

let gDeploying = false;

export default {
    deploy,
    recover,
};

// rename() cannot replace a non-empty directory, so a crashed swap can leave the
// live folder missing and the previous tree under .deploy. Put it back before startup continues.
function destinationForPrevious(name) {
    if (/^[0-9a-f]{16}\.previous$/.test(name) || /^[0-9a-f]{16}\.public\.previous$/.test(name)) return sites.primaryRoot;

    const alias = /^[0-9a-f]{16}\.public-(.+)\.previous$/.exec(name);
    if (!alias) return null;
    return sites.folderForHostname(alias[1]);
}

function recover() {
    if (!fs.existsSync(gDeployFolder)) return;

    const keep = new Set();
    const groups = new Map();

    for (const name of fs.readdirSync(gDeployFolder)) {
        if (!name.endsWith('.previous')) continue;

        const destination = destinationForPrevious(name);
        if (!destination) {
            console.error('Ignoring unrecognized previous deploy', name);
            keep.add(name);
            continue;
        }

        const list = groups.get(destination) || [];
        list.push(name);
        groups.set(destination, list);
    }

    for (const [destination, list] of groups) {
        if (list.length > 1) {
            console.error('More than one previous deploy was found for', destination);
            for (const name of list) keep.add(name);
            continue;
        }

        if (!fs.existsSync(destination)) {
            fs.renameSync(path.join(gDeployFolder, list[0]), destination);
            console.error('Restored site folder after an interrupted deploy', destination);
        }
    }

    for (const name of fs.readdirSync(gDeployFolder)) {
        if (keep.has(name)) continue;
        fs.rmSync(path.join(gDeployFolder, name), { recursive: true, force: true });
    }
}

function badArchive(message) {
    const error = new Error(message);
    error.code = 'EBADARCHIVE';
    return error;
}

function limitArchiveSize(max) {
    let received = 0;

    return new Transform({
        transform(chunk, encoding, callback) {
            received += chunk.length;
            if (received > max) {
                const error = new Error('deploy archive is too large');
                error.code = 'ETOOBIG';
                callback(error);
                return;
            }
            callback(null, chunk);
        }
    });
}

async function rmQuiet(target) {
    const [error] = await safe(fsPromises.rm(target, { recursive: true, force: true }));
    if (error) console.error('deploy: cleanup failed', target, error);
}

async function extractArchive(archivePath, staging) {
    let rejected = '';
    let extracted = 0;

    const [extractError] = await safe(tar.x({
        file: archivePath,
        cwd: staging,
        unlink: true,
        filter: function (entryPath, entry) {
            if (rejected) return false;

            if (REJECTED_TYPES.has(entry.type)) {
                rejected = `unsupported archive entry: ${entryPath}`;
                return false;
            }

            extracted += Number(entry.size) || 0;
            if (extracted > MAX_EXTRACTED_BYTES) {
                rejected = 'deploy is too large';
                return false;
            }

            return true;
        },
        onwarn: function (code, message) {
            if (code === 'TAR_ENTRY_ERROR' || code === 'TAR_ENTRY_INVALID' || code === 'TAR_BAD_ARCHIVE' || code === 'TAR_ABORT') {
                rejected = message || code;
            }
        }
    }));

    if (rejected) throw badArchive(rejected);
    if (extractError) throw extractError;

    const entries = await fsPromises.readdir(staging, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
        if (entry.isSymbolicLink()) throw badArchive('links are not allowed');
    }
}

// Move the live folder aside, then move the staged folder into its place.
// The live path is absent between the two renames. On failure, move the old folder back.
async function swapIntoPlace(staging, previous, root) {
    const [renameError] = await safe(fsPromises.rename(root, previous));
    if (renameError && renameError.code !== 'ENOENT') throw renameError;

    const movedAside = !renameError;
    const [swapError] = await safe(fsPromises.rename(staging, root));
    if (!swapError) return;

    if (movedAside) {
        const [restoreError] = await safe(fsPromises.rename(previous, root));
        if (restoreError) console.error('deploy: failed to restore previous site', restoreError);
    }
    throw swapError;
}

async function receiveAndPublish(req, root, site) {
    const id = crypto.randomBytes(8).toString('hex');
    const archivePath = path.join(gDeployFolder, `${id}.tar.gz`);
    const staging = path.join(gDeployFolder, id);
    const previous = path.join(gDeployFolder, `${id}.public${site ? '-' + site : ''}.previous`);

    await fsPromises.mkdir(gDeployFolder, { recursive: true });

    const [error] = await safe(async function () {
        await pipeline(req, limitArchiveSize(MAX_ARCHIVE_BYTES), fs.createWriteStream(archivePath));
        await fsPromises.mkdir(staging, { recursive: true });
        await extractArchive(archivePath, staging);
        await swapIntoPlace(staging, previous, root);

        const [cleanupError] = await safe(fsPromises.rm(previous, { recursive: true, force: true }));
        if (cleanupError) console.error('deploy: failed to remove previous site', cleanupError);
    });

    await rmQuiet(archivePath);
    if (!error) return;

    await rmQuiet(staging);
    throw error;
}

function deploy(req, res, next) {
    if (gDeploying) return next(new HttpError(409, 'a deploy is already in progress'));

    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/gzip' && type !== 'application/x-gzip') return next(new HttpError(400, 'expected application/gzip'));

    const message = safe(function () { return deploys.readMessage(req); });
    if (safe.error) return next(new HttpError(400, safe.error.message));

    const site = safe(function () { return sites.readSite(req); });
    if (safe.error) return next(new HttpError(400, safe.error.message));

    const root = site ? sites.folderForHostname(site) : sites.primaryRoot;

    gDeploying = true;

    (async function () {
        const [error] = await safe(receiveAndPublish(req, root, site));
        gDeploying = false;

        if (error) {
            console.error('deploy:', error);
            if (error.code === 'ETOOBIG') return next(new HttpError(413, 'deploy archive is too large'));
            if (error.code === 'EBADARCHIVE') return next(new HttpError(400, error.message));
            return next(new HttpError(500, error.message));
        }

        safe(function () { deploys.add(req, message, site); });
        if (safe.error) console.error('deploy: failed to record deploy', safe.error);

        next(new HttpSuccess(201, {}));
    })();
}
