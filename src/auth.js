'use strict';

var path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    oidc = require('express-openid-connect'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    webdavErrors = require('webdav-server').v2.Errors;

const TOKENSTORE_FILE = path.resolve(process.env.TOKENSTORE_FILE || './.tokens.json');
const LOGIN_TOKEN_PREFIX = 'login-';
const API_TOKEN_PREFIX = 'api'; // keep this base64 for CI systems. see gitlab masked variables requirements

const tokenStore = {
    data: {},
    save: function () {
        try {
            fs.writeFileSync(TOKENSTORE_FILE, JSON.stringify(tokenStore.data), 'utf-8');
        } catch (e) {
            console.error(`Unable to save tokenstore file at ${TOKENSTORE_FILE}`, e);
        }
    },
    get: function (token, callback) {
        callback(tokenStore.data[token] ? null : 'not found', tokenStore.data[token]);
    },
    getApiTokens: function (callback) {
        callback(null, Object.keys(tokenStore.data).filter(function (t) { return t.indexOf(API_TOKEN_PREFIX) === 0; }));
    },
    set: function (token, user, callback) {
        tokenStore.data[token] = user;
        tokenStore.save();
        callback(null);
    },
    del: function (token, callback) {
        delete tokenStore.data[token];
        tokenStore.save();
        callback(null);
    }
};

// load token store data if any
try {
    console.log(`Using tokenstore file at: ${TOKENSTORE_FILE}`);
    tokenStore.data = JSON.parse(fs.readFileSync(TOKENSTORE_FILE, 'utf-8'));
} catch (e) {
    // start with empty token store
}

function hat (bits) {
    return crypto.randomBytes(bits / 8).toString('hex');
}

exports.oidcMiddleware = oidc.auth({
    issuerBaseURL: process.env.CLOUDRON_OIDC_ISSUER,
    baseURL: process.env.CLOUDRON_APP_ORIGIN,
    clientID: process.env.CLOUDRON_OIDC_CLIENT_ID,
    clientSecret: process.env.CLOUDRON_OIDC_CLIENT_SECRET,
    secret: 'cookie secret',
    authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email'
    },
    authRequired: false,
    routes: {
        callback: '/api/oidc/callback',
        login: false,
        logout: '/api/oidc/logout'
    }
});

exports.oidcLogin = function (req, res) {
    res.oidc.login({
        returnTo: req.query.returnTo || '/_admin',
        authorizationParams: {
            redirect_uri: process.env.CLOUDRON_APP_ORIGIN + '/api/oidc/callback',
        },
    });
};

exports.oidcAuth = oidc.requiresAuth();

exports.verifyToken = function (req, res, next) {
    var accessToken = req.query.access_token || req.body.accessToken;

    tokenStore.get(accessToken, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid Access Token'));

        req.user = user;

        next();
    });
};

exports.getProfile = function (req, res, next) {
    next(new HttpSuccess(200, { username: req.user.username }));
};

exports.createOidcToken = function (req, res, next) {
    const accessToken = LOGIN_TOKEN_PREFIX + hat(128);

    tokenStore.set(accessToken, { username: req.oidc.user.sub }, function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(201, { accessToken }));
    });
};

exports.getTokens = function (req, res, next) {
    tokenStore.getApiTokens(function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { accessTokens: result }));
    });
};

exports.createToken = function (req, res, next) {
    const accessToken = API_TOKEN_PREFIX + hat(128);

    tokenStore.set(accessToken, req.user, function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(201, { accessToken: accessToken }));
    });
};

exports.delToken = function (req, res, next) {
    tokenStore.del(req.params.token, function (error) {
        if (error) console.error(error);

        next(new HttpSuccess(200, {}));
    });
};

// webdav usermanager
exports.WebdavUserManager = WebdavUserManager;

// This implements the required interface only for the Basic Authentication for webdav-server
function WebdavUserManager() {
    this._authCache = {
        // key: TimeToDie as ms
    };
}

WebdavUserManager.prototype.getDefaultUser = function (callback) {
    // this is only a dummy user, since we always require authentication
    var user = {
        username: 'DefaultUser',
        password: null,
        isAdministrator: false,
        isDefaultUser: true,
        uid: 'DefaultUser'
    };

    callback(user);
};

// password is the access token, username is ignored
WebdavUserManager.prototype.getUserByNamePassword = function (username, password, callback) {
    const that = this;

    const cacheKey = 'key-' + password;

    tokenStore.get(password, function (error, result) {
        if (error) return callback(webdavErrors.UserNotFound);

        const user = {
            username: result.username,
            isAdministrator: true,
            isDefaultUser: false,
            uid: result.username
        };

        if (that._authCache[cacheKey] && that._authCache[cacheKey] > Date.now()) return callback(null, user);

        // delete in case it expired
        delete that._authCache[cacheKey];

        that._authCache[cacheKey] = Date.now() + (60 * 1000); // cache for up to 1 min

        callback(null, user);
    });
};
