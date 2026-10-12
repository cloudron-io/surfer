'use strict';

import { HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import history from '../history.js';
import SurferError from '../surfererror.js';

async function get(req, res, next) {
    const [error, rows] = await safe(history.list());
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(200, rows || []));
}

export default { get };
