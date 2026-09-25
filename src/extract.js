'use strict';

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'path';
import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import yauzl from 'yauzl';
import * as tar from 'tar';
import sites from './sites.js';

const ZIP_EXTENSIONS = [ '.zip' ];
const TAR_EXTENSIONS = [ '.tar', '.tgz', '.tar.gz', '.tar.xz', '.tar.bz2' ];

export default { extract };

function getAbsolutePath(root, filePath) {
    const absoluteFilePath = path.resolve(path.join(root, filePath));

    if (!sites.contains(root, absoluteFilePath)) return null;
    return absoluteFilePath;
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
                    return reject(new HttpError(403, 'invalid archive path'));
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

function extract(req, res, next) {
    const filePath = req.body && req.body.path;

    if (typeof filePath !== 'string' || !filePath) return next(new HttpError(400, 'missing path'));

    const root = safe(function () { return sites.rootForQuery(req); });
    if (safe.error) return next(new HttpError(400, safe.error.message));

    const absoluteFilePath = getAbsolutePath(root, filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    const fileName = path.basename(filePath);
    const destination = path.dirname(absoluteFilePath);

    let extractPromise;
    if (isZipFile(fileName)) extractPromise = extractZip(absoluteFilePath, destination);
    else if (isTarFile(fileName)) extractPromise = extractTar(absoluteFilePath, destination);
    else return next(new HttpError(400, 'unsupported archive format'));

    (async function () {
        const [error] = await safe(extractPromise);
        if (error) {
            console.error('extract:', error);
            return next(new HttpError(500, error.message));
        }

        next(new HttpSuccess(200, {}));
    })();
}
