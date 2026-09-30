'use strict';

import crypto from 'crypto';
import * as tegel from '@cloudron/tegel';
import { HttpSuccess } from '@cloudron/connect-lastmile';
import webdavServer from 'webdav-server';

const webdavErrors = webdavServer.v2.Errors;

// OIDC session cookie, bearer token, or Authorization: Basic with a Cloudron username and app password.
const requireAuth = tegel.requireAnyAuth({ realm: 'Cloudron Surfer' });

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
