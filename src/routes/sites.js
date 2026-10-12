'use strict';

import { HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import sites from '../sites.js';
import SurferError from '../surfererror.js';

function text(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function list(req, res, next) {
    const [error, body] = await safe(sites.list());
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, body));
}

async function create(req, res, next) {
    const body = req.body || {};
    const [error, site] = await safe(sites.create(text(body.name), text(body.domain)));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, site));
}

async function update(req, res, next) {
    const body = req.body || {};
    const [error, site] = await safe(sites.update(text(req.params.domain), text(body.name), text(body.domain)));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, site));
}

async function remove(req, res, next) {
    const [error] = await safe(sites.remove(text(req.params.domain)));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, {}));
}

export default {
    list,
    create,
    update,
    remove,
};
