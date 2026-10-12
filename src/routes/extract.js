'use strict';

import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import extractArchive from '../extract.js';
import sites from '../sites.js';
import SurferError from '../surfererror.js';

async function extract(req, res, next) {
    const filePath = req.body && req.body.path;
    if (typeof filePath !== 'string' || !filePath) return next(new HttpError(400, 'missing path'));

    const [error] = await safe(extractArchive.extract(sites.requestHost(req), req.query.deployment, filePath));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, {}));
}

export default { extract };
