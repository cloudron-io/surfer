'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import safe from '@cloudron/safetydance';
import history from './history.js';
import sites from './sites.js';
import SurferError from './surfererror.js';

const gDeployFolder = path.join(sites.dataDir, '.deploy');

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;

const REJECTED_TYPES = new Set([ 'SymbolicLink', 'Link', 'CharacterDevice', 'BlockDevice', 'FIFO', 'GNUDumpDir' ]);

export default {
    publish,
    promote,
    recover,
};

// rename() cannot replace a non-empty directory, so a crashed swap can leave the
// live folder missing and the previous tree under .deploy. Put it back before startup continues.
function destinationForPrevious(name) {
    if (/^[0-9a-f]{16}\.previous$/.test(name)) return sites.primaryRoot;

    const match = /^[0-9a-f]{16}\.(.+)\.previous$/.exec(name);
    if (!match) return null;

    const label = match[1];
    if (label === 'public' || label === path.basename(sites.primaryRoot)) return sites.primaryRoot;
    return sites.rootForPublicDir(label);
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
    return new SurferError(SurferError.BAD_FIELD, message);
}

function limitArchiveSize(max) {
    let received = 0;

    return new Transform({
        transform(chunk, encoding, callback) {
            received += chunk.length;
            if (received > max) {
                callback(new SurferError(SurferError.TOO_LARGE, 'deploy archive is too large'));
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

async function publishDirectory(source, root) {
    const id = crypto.randomBytes(8).toString('hex');
    const staging = path.join(gDeployFolder, id);
    const previous = path.join(gDeployFolder, `${id}.public.previous`);

    await fsPromises.mkdir(gDeployFolder, { recursive: true });

    const [error] = await safe(async function () {
        await fsPromises.cp(source, staging, { recursive: true, dereference: true });
        await swapIntoPlace(staging, previous, root);

        const [cleanupError] = await safe(fsPromises.rm(previous, { recursive: true, force: true }));
        if (cleanupError) console.error('deploy: failed to remove previous site', cleanupError);
    });

    if (!error) return;

    await rmQuiet(staging);
    throw error;
}

async function promote(name, user) {
    if (!sites.isDeployName(name) || name === 'default') throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');

    const source = sites.deploymentRoot(name);
    if (!source || source === sites.primaryRoot) throw new SurferError(SurferError.BAD_FIELD, 'unknown site');

    if (!sites.tryLock()) throw new SurferError(SurferError.BUSY, 'a deploy is already in progress');

    try {
        await publishDirectory(source, sites.primaryRoot);
        try {
            history.add(user, 'Deployed from ' + name, 'default');
        } catch (error) {
            console.error('deploy: failed to record deploy', error);
        }
    } catch (error) {
        console.error('deploy:', error);
        throw new SurferError(SurferError.INTERNAL_ERROR, error.message);
    } finally {
        sites.unlock();
    }
}

async function publish(stream, headers, user) {
    const message = history.parseMessage(headers['surfer-message']);
    const deployment = sites.readDeploymentHeader(headers['surfer-deployment']);
    const root = sites.deploymentRoot(deployment);
    if (!root) throw new SurferError(SurferError.BAD_FIELD, 'unknown deployment');

    if (!sites.tryLock()) throw new SurferError(SurferError.BUSY, 'a deploy is already in progress');

    try {
        await receiveAndPublish(stream, root, deployment === 'default' ? '' : deployment);
        try {
            history.add(user, message, deployment);
        } catch (error) {
            console.error('deploy: failed to record deploy', error);
        }
    } catch (error) {
        console.error('deploy:', error);
        if (error instanceof SurferError) throw error;
        throw new SurferError(SurferError.INTERNAL_ERROR, error.message);
    } finally {
        sites.unlock();
    }
}
