'use strict';

import fs from 'node:fs';
import safe from '@cloudron/safetydance';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import settings from '../settings.js';
import { PASSWORD_PLACEHOLDER } from './access.js';

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

function createSettings({ config, faviconFile, faviconFallback, resetStatic, updatePassword }) {
    function get(req, res) {
        const origin = webadminOrigin();

        res.send({
            folderListingEnabled: !!config.folderListingEnabled,
            title: config.title || 'Surfer',
            index: config.index || '',
            accessRestriction: config.accessRestriction || '',
            accessPassword: config.accessPassword ? PASSWORD_PLACEHOLDER : '', // don't send the password, helps the UI to figure if a password was set at all
            oidcProviderName: process.env.CLOUDRON_OIDC_PROVIDER_NAME || 'Cloudron',
            appPasswordsUrl: origin ? `${origin}/#/profile` : '',
            locationUrl: origin && process.env.CLOUDRON_APP_HOSTNAME ? `${origin}/#/app/${process.env.CLOUDRON_APP_HOSTNAME}/location` : ''
        });
    }

    function put(req, res, next) {
        if (typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
        if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
        if (req.body.index && typeof req.body.index !== 'string') return next(new HttpError(400, 'index must be falsy or a string'));
        if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));
        if ('accessPassword' in req.body && typeof req.body.accessPassword !== 'string') return next(new HttpError(400, 'accessPassword must be a string'));

        function updatePasswordIfNeeded(callback) {
            if (!('accessPassword' in req.body) || req.body.accessPassword === PASSWORD_PLACEHOLDER) return callback();
            updatePassword(req.body.accessPassword, callback);
        }

        config.folderListingEnabled = !!req.body.folderListingEnabled;
        config.title = req.body.title;
        config.index = req.body.index;

        resetStatic();

        config.accessRestriction = req.body.accessRestriction;

        updatePasswordIfNeeded(function (error) {
            if (error) return next(new HttpError(500, 'failed to set password'));

            safe(function () { settings.save(config); });
            if (safe.error) {
                console.error('unable to save settings', safe.error);
                return next(new HttpError(500, 'unable to save settings'));
            }

            next(new HttpSuccess(201, {}));
        });
    }

    function getFavicon(req, res) {
        if (fs.existsSync(faviconFile)) res.sendFile(faviconFile);
        else res.sendFile(faviconFallback);
    }

    function putFavicon(req, res, next) {
        if (!req.files || !req.files.file) return next(new HttpError(400, 'missing file'));

        fs.copyFile(req.files.file.path, faviconFile, function (error) {
            if (error) {
                console.error('Failed to save favicon.', error);
                return next(new HttpError(500, 'Failed to save favicon'));
            }

            next(new HttpSuccess(201, {}));
        });
    }

    function deleteFavicon(req, res, next) {
        fs.unlink(faviconFile, function (error) {
            if (error) {
                console.error('Failed to reset favicon.', error);
                return next(new HttpError(500, 'Failed to reset favicon'));
            }

            next(new HttpSuccess(201, {}));
        });
    }

    return { get, put, getFavicon, putFavicon, deleteFavicon };
}

export default createSettings;
