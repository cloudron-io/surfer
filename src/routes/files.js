'use strict';

import fs from 'fs';
import fsPromises from 'node:fs/promises';
import path from 'path';
import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import { getMimeType } from '../mime.js';
import sites from '../sites.js';

export default {
    getFolderListing,

    get,
    put,
    post,
    copy,
    del
};

function boolLike(arg) {
    if (!arg) return false;
    if (typeof arg === 'number') return !!arg;
    if (typeof arg === 'string' && arg.toLowerCase() === 'false') return false;

    return true;
}

function createDirectory(targetPath, callback) {
    fs.mkdir(targetPath, { recursive: true }, function (error) {
        if (error) return callback(error);
        callback(null);
    });
}

function isProtected(root, targetPath) {
    return sites.contains(path.resolve(root, '_admin'), targetPath);
}

function getAbsolutePath(root, filePath) {
    const absoluteFilePath = path.resolve(path.join(root, filePath));

    if (!sites.contains(root, absoluteFilePath)) return null;
    return absoluteFilePath;
}

function removeBasePath(root, filePath) {
    return filePath.slice(path.resolve(root).length);
}

function collectFiles(root, folderPath, recursive, callback) {
    let results = [];

    fs.readdir(folderPath, function (error, list) {
        if (error) return callback(error);

        let pending = list.length;
        if (!pending) return callback(null, results);

        list.forEach(function (file) {
            const filePath = path.resolve(folderPath, file);

            fs.stat(filePath, function (error, stat) {
                if (error) return callback(error);

                results.push({
                    isDirectory: stat.isDirectory(),
                    isFile: stat.isFile(),
                    atime: stat.atime,
                    mtime: stat.mtime,
                    ctime: stat.ctime,
                    birthtime: stat.birthtime,
                    size: stat.size,
                    fileName: file,
                    filePath: removeBasePath(root, filePath),
                    mimeType: stat.isDirectory() ? null : getMimeType(file)
                });

                if (stat.isDirectory() && recursive) {
                    collectFiles(root, filePath, recursive, function (error, result) {
                        if (error) return callback(error);

                        results = results.concat(result);
                        if (!--pending) callback(null, results);
                    });
                } else {
                    if (!--pending) callback(null, results);
                }
            });
        });
    });
}

// TODO maybe unify getFolderListing() and get()
function getFolderListing(root, filePath, callback) {
    const absoluteFilePath = getAbsolutePath(root, filePath);
    if (!absoluteFilePath) return callback(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, stat) {
        if (error) return callback(new HttpError(404, error));

        console.log('get', absoluteFilePath);

        if (!stat.isDirectory()) return callback(new HttpError(500, 'unsupported type'));

        collectFiles(root, absoluteFilePath, false /* recursive */, function (error, results) {
            if (error) return callback(new HttpError(500, error));

            const tmp = {
                isDirectory: true,
                isFile: false,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                birthtime: stat.birthtime,
                size: stat.size,
                fileName: '',
                filePath: removeBasePath(root, absoluteFilePath),
                mimeType: null
            };

            callback(null, { stat: tmp, entries: results });
        });
    });
}

function deployRoot(req, next) {
    const root = safe(function () { return sites.rootForQuery(req); });
    if (!safe.error) return root;

    next(new HttpError(400, safe.error.message));
    return null;
}

function get(req, res, next) {
    const root = deployRoot(req, next);
    if (!root) return;
    const recursive = boolLike(req.query.recursive);
    const filePath = req.params.path.join('/');

    const absoluteFilePath = getAbsolutePath(root, filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, stat) {
        if (error) return next(new HttpError(404, error));

        console.log('get:', absoluteFilePath);

        if (!stat.isDirectory() && !stat.isFile()) return next(new HttpError(500, 'unsupported type'));
        if (stat.isFile()) {
            if (boolLike(req.query.inline)) return res.sendFile(absoluteFilePath);
            return res.download(absoluteFilePath);
        }

        collectFiles(root, absoluteFilePath, recursive, function (error, results) {
            if (error) return next(new HttpError(500, error));

            const tmp = {
                isDirectory: true,
                isFile: false,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                birthtime: stat.birthtime,
                size: stat.size,
                fileName: '',
                filePath: removeBasePath(root, absoluteFilePath),
                mimeType: null
            };

            res.status(222).send({ stat: tmp, entries: results });
        });
    });
}

function post(req, res, next) {
    const filePath = req.params.path.join('/');
    const isDirectory = boolLike(req.query.directory);

    if (!(req.files && req.files.file) && !isDirectory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && isDirectory) return next(new HttpError(400, 'either file or directory'));

    const mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;

    console.log('post:', filePath, mtime);

    const root = deployRoot(req, next);
    if (!root) return;
    const absoluteFilePath = getAbsolutePath(root, filePath);
    if (!absoluteFilePath || isProtected(root, absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error && error.code !== 'ENOENT') return next(new HttpError(500, error));

        if (result && isDirectory) return next(new HttpError(409, 'name already exists'));
        if (result && result.isDirectory()) return next(new HttpError(409, 'cannot post on directories'));

        if (isDirectory) {
            return createDirectory(absoluteFilePath, function (error) {
                if (error) return next(new HttpError(500, error));
                next(new HttpSuccess(201, {}));
            });
        } else if (!result || result.isFile()) {
            // ensure directory
            try {
                fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
            } catch (error) {
                return next(new HttpError(500, error));
            }

            return fs.copyFile(req.files.file.path, absoluteFilePath, function (error) {
                if (error) return next(new HttpError(500, error));

                if (!mtime) return next(new HttpSuccess(201, {}));

                // if mtime was passed, set it
                fs.open(absoluteFilePath, function (error, result) {
                    if (error) return next(new HttpError(500, error));

                    fs.futimes(result, mtime, mtime, function (error) {
                        if (error) return next(new HttpError(500, error));
                        next(new HttpSuccess(201, {}));
                    });
                });
            });
        }

        return next(new HttpError(500, 'unsupported type'));
    });
}

function put(req, res, next) {
    const oldFilePath = req.params.path.join('/');

    if (!req.body || !req.body.newFilePath) return next(new HttpError(400, 'missing newFilePath'));

    const newFilePath = decodeURIComponent(req.body.newFilePath);

    console.log('put: %s -> %s', oldFilePath, newFilePath);

    const root = deployRoot(req, next);
    if (!root) return;
    const absoluteOldFilePath = getAbsolutePath(root, oldFilePath);
    if (!absoluteOldFilePath || isProtected(root, absoluteOldFilePath)) return next(new HttpError(403, 'Path not allowed'));

    const absoluteNewFilePath = getAbsolutePath(root, newFilePath);
    if (!absoluteNewFilePath || isProtected(root, absoluteNewFilePath)) return next(new HttpError(403, 'Path not allowed'));

    function doRename(targetFilePath) {
        fs.rename(absoluteOldFilePath, targetFilePath, function (error) {
            if (error) return next (new HttpError(500, error));

            console.log('put: successful');

            return next(new HttpSuccess(200, {}));
        });
    }

    if (req.body.overwrite === false) {
        return fs.stat(absoluteNewFilePath, function (error) {
            if (!error) return next(new HttpError(409, 'destination exists'));
            doRename(absoluteNewFilePath);
        });
    }

    if (req.body.overwrite === 'rename') {
        return getUniquePath(absoluteNewFilePath).then(function (targetPath) {
            doRename(targetPath);
        });
    }

    doRename(absoluteNewFilePath);
}

async function getUniquePath(targetPath) {
    if (!fs.existsSync(targetPath)) return targetPath;

    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);

    for (let i = 1; ; ++i) {
        const candidate = path.join(dir, `${base} (${i})${ext}`);
        if (!fs.existsSync(candidate)) return candidate;
    }
}

function copy(req, res, next) {
    const sources = req.body && req.body.sources;
    const destination = req.body && req.body.destination;

    if (!Array.isArray(sources) || !sources.length || !sources.every(function (p) { return typeof p === 'string'; })) return next(new HttpError(400, 'missing sources array'));
    if (typeof destination !== 'string' || !destination) return next(new HttpError(400, 'missing destination string'));

    const root = deployRoot(req, next);
    if (!root) return;
    const absoluteDestination = getAbsolutePath(root, destination);
    if (!absoluteDestination || isProtected(root, absoluteDestination)) return next(new HttpError(403, 'Path not allowed'));

    async function copyOne(sourceFilePath) {
        const absoluteSource = getAbsolutePath(root, sourceFilePath);
        if (!absoluteSource || isProtected(root, absoluteSource)) throw new HttpError(403, 'Path not allowed');

        const targetPath = await getUniquePath(path.join(absoluteDestination, path.basename(absoluteSource)));

        const [error] = await safe(fsPromises.cp(absoluteSource, targetPath, { recursive: true }));
        if (error) throw new HttpError(500, error.message);
    }

    (async function () {
        try {
            for (const source of sources) await copyOne(source);
        } catch (error) {
            if (error instanceof HttpError) return next(error);
            return next(new HttpError(500, error.message));
        }

        next(new HttpSuccess(201, {}));
    })();
}

function del(req, res, next) {
    const filePath = req.params.path.join('/');
    const recursive = boolLike(req.query.recursive);

    const root = deployRoot(req, next);
    if (!root) return;
    const absoluteFilePath = getAbsolutePath(root, filePath);
    if (!absoluteFilePath) return next(new HttpError(404, 'Not found'));

    if (isProtected(root, absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, async function (error, result) {
        if (error) return next(new HttpError(404, error));

        if (result.isDirectory() && !recursive) return next(new HttpError(403, 'Is directory'));

        [error] = await safe(fsPromises.rm(absoluteFilePath, { recursive: true }));
        if (error) {
            console.error(error);
            return next(new HttpError(500, 'Unable to remove'));
        }

        // TODO remove result after some time
        next(new HttpSuccess(200, { entries: [] }));
    });
}
