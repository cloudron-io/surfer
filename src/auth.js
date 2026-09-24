'use strict';

import crypto from 'crypto';
import safe from '@cloudron/safetydance';
import * as tegel from '@cloudron/tegel';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import webdavServer from 'webdav-server';

const webdavErrors = webdavServer.v2.Errors;
const requireSession = tegel.requireAuth();

function parseBasicAuth(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') return null;
    if (!authHeader.toLowerCase().startsWith('basic ')) return null;

    const decoded = safe(() => Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8'));
    if (!decoded) return null;

    const colon = decoded.indexOf(':');
    if (colon <= 0) return null;

    return {
        username: decoded.slice(0, colon),
        password: decoded.slice(colon + 1),
    };
}

// Returns the Cloudron user, null for a bad password, and throws if the app bridge fails.
async function verifyCloudronCredentials(identifier, password) {
    if (!process.env.CLOUDRON) return null;
    if (!identifier || !password) return null;

    try {
        return await tegel.appBridge.verifyAppPassword({ identifier, password });
    } catch (error) {
        if (error.status === 401) return null;
        throw error;
    }
}

function sessionUser(user) {
    return {
        username: user.username,
        name: user.name || user.displayName || '',
    };
}

// OIDC session cookie, or Authorization: Basic with a Cloudron username and app password.
async function requireAuth(req, res, next) {
    const basic = parseBasicAuth(req.headers.authorization);
    if (basic) {
        const [error, user] = await safe(verifyCloudronCredentials(basic.username, basic.password));
        if (error) {
            console.error('App password verification failed:', error.message || error);
            return next(new HttpError(500, 'Failed to verify app password'));
        }
        if (!user || !user.username) return next(new HttpError(401, 'Invalid username or password'));

        req.user = sessionUser(user);
        return next();
    }

    return requireSession(req, res, next);
}

function getProfile(req, res, next) {
    next(new HttpSuccess(200, { username: req.user.username, name: req.user.name || req.user.displayName || '' }));
}

// This implements the required interface only for the Basic Authentication for webdav-server
function WebdavUserManager() {
    this._authCache = {
        // key: { expires, user }
    };
}

WebdavUserManager.prototype.getDefaultUser = function (callback) {
    // this is only a dummy user, since we always require authentication
    const user = {
        username: 'DefaultUser',
        password: null,
        isAdministrator: false,
        isDefaultUser: true,
        uid: 'DefaultUser'
    };

    callback(user);
};

WebdavUserManager.prototype.getUserByNamePassword = function (username, password, callback) {
    const that = this;
    const cacheKey = crypto.createHash('sha256').update(String(username) + '\0' + String(password)).digest('hex');
    const cached = that._authCache[cacheKey];
    if (cached && cached.expires > Date.now()) return callback(null, cached.user);

    verifyCloudronCredentials(username, password).then(function (user) {
        if (!user || !user.username) return callback(webdavErrors.UserNotFound);

        const webdavUser = {
            username: user.username,
            isAdministrator: true,
            isDefaultUser: false,
            uid: user.username
        };

        that._authCache[cacheKey] = { expires: Date.now() + (60 * 1000), user: webdavUser };
        callback(null, webdavUser);
    }).catch(function (error) {
        console.error('WebDAV app password verification failed:', error.message || error);
        callback(webdavErrors.UserNotFound);
    });
};

export default {
    getProfile,
    requireAuth,
    WebdavUserManager,
};
