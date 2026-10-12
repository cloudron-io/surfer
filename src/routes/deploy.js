'use strict';

import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import deploy from '../deploy.js';
import SurferError from '../surfererror.js';

async function publish(req, res, next) {
    const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/gzip' && type !== 'application/x-gzip') return next(new HttpError(400, 'expected application/gzip'));

    const [error] = await safe(deploy.publish(req, req.headers, req.user));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

async function promote(req, res, next) {
    const name = typeof req.params.name === 'string' ? req.params.name.trim().toLowerCase() : '';
    const [error] = await safe(deploy.promote(name, req.user));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

export default {
    publish,
    promote,
};
