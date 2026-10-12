'use strict';

import path from 'node:path';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import access from '../access.js';
import settings from '../settings.js';
import SurferError from '../surfererror.js';

const appRoot = path.resolve(import.meta.dirname, '../..');

function handleProtection(req, res, next) {
    const config = settings.current();
    if (!config.accessRestriction) return next();
    if (config.accessRestriction === 'password' && access.cookieMatches(req.headers.cookie)) return next();
    if (config.accessRestriction === 'user' && req.session.user) return next();

    res.status(401).sendFile(path.join(appRoot, 'dist', 'protected.html'));
}

async function protectedLogin(req, res, next) {
    if (!req.body || typeof req.body.password !== 'string') return next(new HttpError(400, 'missing password'));

    const [error, token] = await safe(access.login(req.body.password));
    if (error) return next(SurferError.toHttpError(error));

    res.cookie(access.PASSWORD_COOKIE, token, {
        httpOnly: true,
        secure: !!process.env.CLOUDRON || process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });

    next(new HttpSuccess(200, {}));
}

export default {
    handleProtection,
    protectedLogin,
};
