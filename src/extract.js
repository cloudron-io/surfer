'use strict';

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import yauzl from 'yauzl';
import * as tar from 'tar';
import sites from './sites.js';
import SurferError from './surfererror.js';

const ZIP_EXTENSIONS = [ '.zip' ];
const TAR_EXTENSIONS = [ '.tar', '.tgz', '.tar.gz', '.tar.xz', '.tar.bz2' ];

function absolutePath(root, filePath) {
    const resolved = path.resolve(path.join(root, filePath));
    if (!sites.contains(root, resolved)) return null;
    return resolved;
}

function isZipFile(fileName) {
    return ZIP_EXTENSIONS.some(function (ext) { return fileName.toLowerCase().endsWith(ext); });
}

function isTarFile(fileName) {
    return TAR_EXTENSIONS.some(function (ext) { return fileName.toLowerCase().endsWith(ext); });
}

// resolves an entry path and ensures it stays within the destination (zip-slip protection)
function safeJoin(destination, entryPath) {
    const resolved = path.resolve(path.join(destination, entryPath));

    if (resolved !== destination && resolved.indexOf(destination + path.sep) !== 0) return null;
    return resolved;
}

function extractZip(absoluteFilePath, destination) {
    return new Promise(function (resolve, reject) {
        yauzl.open(absoluteFilePath, { lazyEntries: true }, function (openError, zipfile) {
            if (openError) return reject(openError);

            zipfile.on('error', reject);
            zipfile.on('end', resolve);
            zipfile.readEntry();

            zipfile.on('entry', function (entry) {
                if (/\/$/.test(entry.fileName)) return zipfile.readEntry();

                const targetPath = safeJoin(destination, entry.fileName);
                if (!targetPath) {
                    zipfile.close();
                    return reject(new SurferError(SurferError.FS_ERROR, 'invalid archive path'));
                }

                zipfile.openReadStream(entry, function (readError, readStream) {
                    if (readError) return reject(readError);

                    fsPromises.mkdir(path.dirname(targetPath), { recursive: true })
                        .then(function () {
                            const writeStream = fs.createWriteStream(targetPath);

                            readStream.pipe(writeStream);
                            writeStream.on('finish', function () { zipfile.readEntry(); });
                            writeStream.on('error', reject);
                        })
                        .catch(reject);
                });
            });
        });
    });
}

function extractTar(absoluteFilePath, destination) {
    // tar.x with cwd prevents path traversal outside the destination by default
    return tar.x({
        file: absoluteFilePath,
        cwd: destination
    });
}

async function extract(host, deployment, filePath) {
    const root = await sites.rootForRequest(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const fileName = path.basename(filePath);
    const destination = path.dirname(absoluteFilePath);

    let extractPromise;
    if (isZipFile(fileName)) extractPromise = extractZip(absoluteFilePath, destination);
    else if (isTarFile(fileName)) extractPromise = extractTar(absoluteFilePath, destination);
    else throw new SurferError(SurferError.BAD_FIELD, 'unsupported archive format');

    const [error] = await safe(extractPromise);
    if (!error) return;

    console.error('extract:', error);
    if (error instanceof SurferError) throw error;
    throw new SurferError(SurferError.FS_ERROR, error.message);
}

export default { extract };
