'use strict';

var fs = require('fs'),
    copyFile = require('./copyFile.js'),
    util = require('util'),
    path = require('path'),
    { rimraf } = require('rimraf'),
    debug = require('debug')('files'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

var gBasePath;

exports = module.exports = function (basePath) {
    gBasePath = basePath;

    return {
        getFolderListing: getFolderListing,

        get: get,
        put: put,
        post: post,
        del: del
    };
};

function boolLike(arg) {
    if (!arg) return false;
    if (util.isNumber(arg)) return !!arg;
    if (util.isString(arg) && arg.toLowerCase() === 'false') return false;

    return true;
}

function createDirectory(targetPath, callback) {
    fs.mkdir(targetPath, { recursive: true }, function (error) {
        if (error) return callback(error);
        callback(null);
    });
}

function isProtected(targetPath) {
    return targetPath.indexOf(getAbsolutePath('_admin')) === 0;
}

function getAbsolutePath(filePath) {
    var absoluteFilePath = path.resolve(path.join(gBasePath, filePath));

    if (absoluteFilePath.indexOf(gBasePath) !== 0) return null;
    return absoluteFilePath;
}

function removeBasePath(filePath) {
    return filePath.slice(gBasePath.length);
}

function collectFiles(folderPath, recursive, callback) {
    let results = [];

    fs.readdir(folderPath, function (error, list) {
        if (error) return callback(error);

        var pending = list.length;
        if (!pending) return callback(null, results);

        list.forEach(function (file) {
            var filePath = path.resolve(folderPath, file);

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
                    filePath: removeBasePath(filePath)
                });

                if (stat.isDirectory() && recursive) {
                    collectFiles(filePath, recursive, function (error, result) {
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
function getFolderListing(filePath, callback) {
    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return callback(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, stat) {
        if (error) return callback(new HttpError(404, error));

        debug('get', absoluteFilePath);

        if (!stat.isDirectory()) return callback(new HttpError(500, 'unsupported type'));

        collectFiles(absoluteFilePath, false /* recursive */, function (error, results) {
            if (error) return callback(new HttpError(500, error));

            var tmp = {
                isDirectory: true,
                isFile: false,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                birthtime: stat.birthtime,
                size: stat.size,
                fileName: '',
                filePath: removeBasePath(absoluteFilePath)
            };

            callback(null, { stat: tmp, entries: results });
        });
    });
}

function get(req, res, next) {
    const recursive = boolLike(req.query.recursive);
    const filePath = req.params[0];

    const absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, stat) {
        if (error) return next(new HttpError(404, error));

        debug('get:', absoluteFilePath);

        if (!stat.isDirectory() && !stat.isFile()) return next(new HttpError(500, 'unsupported type'));
        if (stat.isFile()) return res.download(absoluteFilePath);

        collectFiles(absoluteFilePath, recursive, function (error, results) {
            if (error) return next(new HttpError(500, error));

            var tmp = {
                isDirectory: true,
                isFile: false,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                birthtime: stat.birthtime,
                size: stat.size,
                fileName: '',
                filePath: removeBasePath(absoluteFilePath)
            };

            res.status(222).send({ stat: tmp, entries: results });
        });
    });
}

function post(req, res, next) {
    const filePath = req.params[0];
    const isDirectory = boolLike(req.query.directory);

    if (!(req.files && req.files.file) && !isDirectory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && isDirectory) return next(new HttpError(400, 'either file or directory'));

    const mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;

    debug('post:', filePath, mtime);

    const absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath || isProtected(absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

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
            return copyFile(req.files.file.path, absoluteFilePath, function (error) {
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
    const oldFilePath = req.params[0];

    if (!req.body || !req.body.newFilePath) return next(new HttpError(400, 'missing newFilePath'));

    const newFilePath = decodeURIComponent(req.body.newFilePath);

    debug('put: %s -> %s', oldFilePath, newFilePath);

    const absoluteOldFilePath = getAbsolutePath(oldFilePath);
    if (!absoluteOldFilePath || isProtected(absoluteOldFilePath)) return next(new HttpError(403, 'Path not allowed'));

    const absoluteNewFilePath = getAbsolutePath(newFilePath);
    if (!absoluteNewFilePath || isProtected(absoluteNewFilePath)) return next(new HttpError(403, 'Path not allowed'));

    fs.rename(absoluteOldFilePath, absoluteNewFilePath, function (error) {
        if (error) return next (new HttpError(500, error));

        debug('put: successful');

        return next(new HttpSuccess(200, {}));
    });
}

function del(req, res, next) {
    const filePath = req.params[0];
    const recursive = boolLike(req.query.recursive);

    const absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(404, 'Not found'));

    if (isProtected(absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

    // absoltueFilePath has to have the base path prepended
    if (absoluteFilePath.indexOf(gBasePath) !== 0) return next(new HttpError(404, 'Not found'));

    fs.stat(absoluteFilePath, async function (error, result) {
        if (error) return next(new HttpError(404, error));

        if (result.isDirectory() && !recursive) return next(new HttpError(403, 'Is directory'));

        try {
            await rimraf(absoluteFilePath);

            // in case we deleted all files, ensure gBasePath still exists after
            if (absoluteFilePath === gBasePath) fs.mkdirSync(gBasePath);

            next(new HttpSuccess(200, {}));
        } catch (error) {
            console.error(error);
            next(new HttpError(500, 'Unable to remove'));
        }
    });
}
