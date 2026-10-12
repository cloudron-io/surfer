'use strict';

import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import files from '../files.js';
import sites from '../sites.js';
import SurferError from '../surfererror.js';
import zip from '../zip.js';

const MAX_ZIP_PATHS = 100;

function flag(arg) {
    if (!arg) return false;
    if (typeof arg === 'number') return !!arg;
    if (typeof arg === 'string' && arg.toLowerCase() === 'false') return false;

    return true;
}

function parsePaths(req, next) {
    if (typeof req.query.paths !== 'string' || !req.query.paths) {
        next(new HttpError(400, 'missing paths'));
        return null;
    }

    let filePaths;
    try {
        filePaths = JSON.parse(req.query.paths);
    } catch {
        next(new HttpError(400, 'invalid paths'));
        return null;
    }

    if (!Array.isArray(filePaths) || !filePaths.length || !filePaths.every(function (entry) { return typeof entry === 'string'; })) {
        next(new HttpError(400, 'invalid paths'));
        return null;
    }
    if (filePaths.length > MAX_ZIP_PATHS) {
        next(new HttpError(400, 'too many paths'));
        return null;
    }

    return filePaths;
}

async function get(req, res, next) {
    const filePath = req.params.path.join('/');
    const [error, result] = await safe(files.get(sites.requestHost(req), req.query.deployment, filePath, flag(req.query.recursive)));
    if (error) return next(SurferError.toHttpError(error));

    if (result.type === 'file') {
        if (flag(req.query.inline)) return res.sendFile(result.path);
        return res.download(result.path);
    }

    res.status(222).send({ stat: result.stat, entries: result.entries });
}

async function post(req, res, next) {
    const filePath = req.params.path.join('/');
    const directory = flag(req.query.directory);

    if (!(req.files && req.files.file) && !directory) return next(new HttpError(400, 'missing file or directory'));
    if ((req.files && req.files.file) && directory) return next(new HttpError(400, 'either file or directory'));

    const mtime = req.fields && req.fields.mtime ? new Date(req.fields.mtime) : null;
    const uploadPath = directory ? '' : req.files.file.path;
    const [error] = await safe(files.add(sites.requestHost(req), req.query.deployment, filePath, directory, uploadPath, mtime));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

async function put(req, res, next) {
    if (!req.body || !req.body.newFilePath) return next(new HttpError(400, 'missing newFilePath'));

    let newFilePath;
    try {
        newFilePath = decodeURIComponent(req.body.newFilePath);
    } catch {
        return next(new HttpError(400, 'missing newFilePath'));
    }

    const sourceDeployment = req.body.sourceDeployment;
    const [error] = await safe(files.move(sites.requestHost(req), req.query.deployment, sourceDeployment, req.params.path.join('/'), newFilePath, req.body.overwrite));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, {}));
}

async function copy(req, res, next) {
    const sources = req.body && req.body.sources;
    const destination = req.body && req.body.destination;

    if (!Array.isArray(sources) || !sources.length || !sources.every(function (entry) { return typeof entry === 'string'; })) return next(new HttpError(400, 'missing sources array'));
    if (typeof destination !== 'string' || !destination) return next(new HttpError(400, 'missing destination string'));

    const sourceDeployment = req.body.sourceDeployment;
    const [error] = await safe(files.copy(sites.requestHost(req), req.query.deployment, sourceDeployment, sources, destination));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

async function del(req, res, next) {
    const [error] = await safe(files.remove(sites.requestHost(req), req.query.deployment, req.params.path.join('/'), flag(req.query.recursive)));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, { entries: [] }));
}

async function zipDownload(req, res, next) {
    const filePaths = parsePaths(req, next);
    if (!filePaths) return;

    const [error, absolutePaths] = await safe(files.zipSources(sites.requestHost(req), req.query.deployment, filePaths));
    if (error) return next(SurferError.toHttpError(error));

    const name = (typeof req.query.name === 'string' && req.query.name) ? req.query.name : 'download';
    zip.zipPaths(absolutePaths, name, res);
}

export default {
    get,
    post,
    put,
    copy,
    del,
    zipDownload,
};
