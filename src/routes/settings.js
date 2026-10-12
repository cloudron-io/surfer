'use strict';

import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import access from '../access.js';
import settings from '../settings.js';
import SurferError from '../surfererror.js';
import { resetStatic } from './publicSite.js';

function webadminOrigin() {
    if (process.env.CLOUDRON_WEBADMIN_ORIGIN) return process.env.CLOUDRON_WEBADMIN_ORIGIN.replace(/\/$/, '');

    // Local development has no platform env. The OIDC issuer is the dashboard origin plus /openid.
    const issuer = process.env.OIDC_ISSUER_ORIGIN || '';
    if (!issuer) return '';

    try {
        return new URL(issuer).origin;
    } catch {
        return '';
    }
}

function get(req, res, next) {
    const config = settings.current();
    const origin = webadminOrigin();

    next(new HttpSuccess(200, {
        folderListingEnabled: !!config.folderListingEnabled,
        title: config.title || 'Surfer',
        index: config.index || '',
        accessRestriction: config.accessRestriction || '',
        accessPassword: config.accessPassword ? access.PASSWORD_PLACEHOLDER : '', // don't send the password, helps the UI to figure if a password was set at all
        oidcProviderName: process.env.CLOUDRON_OIDC_PROVIDER_NAME || 'Cloudron',
        appPasswordsUrl: origin ? `${origin}/#/profile` : '',
        locationUrl: origin && process.env.CLOUDRON_APP_HOSTNAME ? `${origin}/#/app/${process.env.CLOUDRON_APP_HOSTNAME}/location` : ''
    }));
}

async function put(req, res, next) {
    if (!req.body || typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
    if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
    if (req.body.index && typeof req.body.index !== 'string') return next(new HttpError(400, 'index must be falsy or a string'));
    if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));
    if ('accessPassword' in req.body && typeof req.body.accessPassword !== 'string') return next(new HttpError(400, 'accessPassword must be a string'));

    let passwordUpdate = null;
    if ('accessPassword' in req.body && req.body.accessPassword !== access.PASSWORD_PLACEHOLDER) {
        const [hashError, hashed] = await safe(access.hashPassword(req.body.accessPassword));
        if (hashError) return next(SurferError.toHttpError(hashError));
        passwordUpdate = hashed;
    }

    const [error] = await safe(settings.update({
        folderListingEnabled: req.body.folderListingEnabled,
        title: req.body.title,
        index: req.body.index,
        accessRestriction: req.body.accessRestriction,
        passwordUpdate: passwordUpdate,
    }));
    if (error) return next(SurferError.toHttpError(error));

    resetStatic();
    next(new HttpSuccess(201, {}));
}

function getFavicon(req, res) {
    res.sendFile(settings.faviconPath());
}

async function putFavicon(req, res, next) {
    if (!req.files || !req.files.file) return next(new HttpError(400, 'missing file'));

    const [error] = await safe(settings.writeFavicon(req.files.file.path));
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

async function deleteFavicon(req, res, next) {
    const [error] = await safe(settings.removeFavicon());
    if (error) return next(SurferError.toHttpError(error));

    next(new HttpSuccess(201, {}));
}

export default {
    get,
    put,
    getFavicon,
    putFavicon,
    deleteFavicon,
};
