'use strict';

var async = require('async'),
    fs = require('fs'),
    path = require('path'),
    rm = require('del'),
    debug = require('debug')('files'),
    mkdirp = require('mkdirp'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

var gBasePath;

exports = module.exports = function (basePath) {
    gBasePath = basePath;

    return {
        get: get,
        put: put,
        post: post,
        del: del
    };
};

// http://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
function copyFile(source, target, cb) {
    var cbCalled = false;

    // ensure directory
    mkdirp(path.dirname(target), function (error) {
        if (error) return cb(error);

        var rd = fs.createReadStream(source);
            rd.on("error", function(err) {
            done(err);
        });

        var wr = fs.createWriteStream(target);
            wr.on("error", function(err) {
            done(err);
        });

        wr.on("close", function(ex) {
            done();
        });

        rd.pipe(wr);

        function done(err) {
            if (!cbCalled) {
                cb(err);
                cbCalled = true;
            }
        }
    });
}

function createDirectory(targetPath, callback) {
    mkdirp(targetPath, function (error) {
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

function get(req, res, next) {
    var filePath = decodeURIComponent(req.params[0]);
    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        debug('get', absoluteFilePath);

        if (!result.isDirectory() && !result.isFile()) return next(new HttpError(500, 'unsupported type'));
        if (result.isFile()) return res.download(absoluteFilePath);

        async.map(fs.readdirSync(absoluteFilePath), function (filePath, callback) {
            fs.stat(path.join(absoluteFilePath, filePath), function (error, result) {
                if (error) return callback(error);

                callback(null, {
                    isDirectory: result.isDirectory(),
                    isFile: result.isFile(),
                    atime: result.atime,
                    mtime: result.mtime,
                    ctime: result.ctime,
                    birthtime: result.birthtime,
                    size: result.size,
                    filePath: filePath
                });
            });
        }, function (error, results) {
            if (error) return next(new HttpError(500, error));
            res.status(222).send({ entries: results });
        });
    });
}

function post(req, res, next) {
    var filePath = decodeURIComponent(req.params[0]);

    if (!(req.files && req.files.file) && !req.query.directory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && req.query.directory) return next(new HttpError(400, 'either file or directory'));

    debug('post:', filePath);

    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath || isProtected(absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error && error.code !== 'ENOENT') return next(new HttpError(500, error));

        if (result && req.query.directory) return next(new HttpError(409, 'name already exists'));
        if (result && result.isDirectory()) return next(new HttpError(409, 'cannot post on directories'));

        if (req.query.directory) {
            return createDirectory(absoluteFilePath, function (error) {
                if (error) return next(new HttpError(500, error));
                next(new HttpSuccess(201, {}));
            });
        } else if (!result || result.isFile()) {
            return copyFile(req.files.file.path, absoluteFilePath, function (error) {
                if (error) return next(new HttpError(500, error));
                next(new HttpSuccess(201, {}));
            });
        }

        return next(new HttpError(500, 'unsupported type'));
    });
}

function put(req, res, next) {
    var oldFilePath = decodeURIComponent(req.params[0]);

    if (!req.body || !req.body.newFilePath) return next(new HttpError(400, 'missing newFilePath'));

    var newFilePath = decodeURIComponent(req.body.newFilePath);

    debug('put: %s -> %s', oldFilePath, newFilePath);

    var absoluteOldFilePath = getAbsolutePath(oldFilePath);
    if (!absoluteOldFilePath || isProtected(absoluteOldFilePath)) return next(new HttpError(403, 'Path not allowed'));

    var absoluteNewFilePath = getAbsolutePath(newFilePath);
    if (!absoluteNewFilePath || isProtected(absoluteNewFilePath)) return next(new HttpError(403, 'Path not allowed'));

    fs.rename(absoluteOldFilePath, absoluteNewFilePath, function (error) {
        if (error) return next (new HttpError(500, error));

        debug('put: successful');

        return next(new HttpSuccess(200, {}));
    });
}

function del(req, res, next) {
    var filePath = decodeURIComponent(req.params[0]);
    var recursive = !!req.query.recursive;
    var dryRun = !!req.query.dryRun;

    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(404, 'Not found'));

    if (isProtected(absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));

    // absoltueFilePath has to have the base path prepended
    if (absoluteFilePath.length <= gBasePath.length) return next(new HttpError(404, 'Not found'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        if (result.isDirectory() && !recursive) return next(new HttpError(403, 'Is directory'));

        // add globs to get file listing
        if (result.isDirectory()) absoluteFilePath += '/**';

        rm(absoluteFilePath, { dryRun: dryRun, force: true }).then(function (result) {
            result = result.map(removeBasePath);
            next(new HttpSuccess(200, { entries: result }));
        }, function (error) {
            console.error(error);
            next(new HttpError(500, 'Unable to remove'));
        });
    });
}
