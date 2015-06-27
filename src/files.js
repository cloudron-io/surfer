'use strict';

var fs = require('fs'),
    path = require('path'),
    ejs = require('ejs'),
    rimraf = require('rimraf'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    get: get,
    put: put,
    del: del
};

var FILE_BASE = path.resolve(__dirname, '../files');

// http://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
function copyFile(source, target, cb) {
    var cbCalled = false;

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
}

function render(view, options) {
    return ejs.render(fs.readFileSync(view, 'utf8'), options);
}

function getAbsolutePath(filePath) {
    var absoluteFilePath = path.resolve(FILE_BASE, filePath);

    if (absoluteFilePath.indexOf(FILE_BASE) !== 0) return null;
    return absoluteFilePath;
}

function get(req, res, next) {
    var filePath = req.params[0];
    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        console.log('get', absoluteFilePath, result);

        if (result.isFile()) return res.sendfile(absoluteFilePath);
        if (result.isDirectory()) return res.status(200).send({ entries: fs.readdirSync(absoluteFilePath) });

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

        console.log('put', absoluteFilePath, result, req.files.file);

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
    var absoluteFilePath = getAbsolutePath(filePath);
    if (!absoluteFilePath) return next(new HttpError(403, 'Path not allowed'));

    fs.stat(absoluteFilePath, function (error, result) {
        if (error) return next(new HttpError(404, error));

        rimraf(absoluteFilePath, function (error) {
            if (error) return next(new HttpError(500, 'Unable to remove'));
            next(new HttpError(200, {}));
        });
    });
}
