'use strict';

var fs = require('fs'),
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

function getAbsolutePath(filePath) {
    var absoluteFilePath = path.resolve(path.join(gBasePath, filePath));

    if (absoluteFilePath.indexOf(gBasePath) !== 0) return null;
    return absoluteFilePath;
}

function removeBasePath(filePath) {
    return filePath.slice(gBasePath.length);
}

function get(req, res, next) {
    var filePath = req.params[0];
    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        debug('get', absoluteFilePath);

        if (result.isFile()) return res.sendFile(absoluteFilePath);
        if (result.isDirectory()) return res.status(222).send({ entries: fs.readdirSync(absoluteFilePath) });

        return next(new HttpError(500, 'unsupported type'));
    });
}

function put(req, res, next) {
    var filePath = req.params[0];

    if (!req.files.file) return next(new HttpError(400, 'missing file'));

    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error && error.code !== 'ENOENT') return next(new HttpError(500, error));

        debug('put', absoluteFilePath, req.files.file);

        if (result && result.isDirectory()) return next(new HttpError(409, 'cannot put on directories'));
        if (!result || result.isFile()) {
            return copyFile(req.files.file.path, absoluteFilePath, function (error) {
                if (error) return next(new HttpError(500, error));
                next(new HttpSuccess(201, {}));
            });
        }

        return next(new HttpError(500, 'unsupported type'));
    });
}

function del(req, res, next) {
    var filePath = req.params[0];
    var recursive = !!req.query.recursive;
    var dryRun = !!req.query.dryRun;

    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(404, 'Not found'));

    // absoltueFilePath has to have the base path prepended
    if (absoluteFilePath.length <= gBasePath.length) return next(new HttpError(404, 'Not found'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        if (result.isDirectory() && !recursive) return next(new HttpError(403, 'Is directory'));

        // add globs to get file listing
        if (result.isDirectory()) absoluteFilePath += '/**';

        rm(absoluteFilePath, { dryRun: dryRun }).then(function (result) {
            result = result.map(removeBasePath);
            next(new HttpSuccess(200, { entries: result }));
        }, function (error) {
            console.error(error);
            next(new HttpError(500, 'Unable to remove'));
        });
    });
}
