'use strict';

var path = require('path'),
    safe = require('safetydance'),
    fs = require('fs'),
    bcrypt = require('bcryptjs'),
    uuid = require('uuid/v4'),
    ldapjs = require('ldapjs'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    webdavErrors = require('webdav-server').v2.Errors;

const LDAP_URL = process.env.CLOUDRON_LDAP_URL;
const LDAP_USERS_BASE_DN = process.env.CLOUDRON_LDAP_USERS_BASE_DN;
const LOCAL_AUTH_FILE = path.resolve(process.env.LOCAL_AUTH_FILE || './.users.json');
const TOKENSTORE_FILE = path.resolve(process.env.TOKENSTORE_FILE || './.tokens.json');
const AUTH_METHOD = (LDAP_URL && LDAP_USERS_BASE_DN) ? 'ldap' : 'local';
const LOGIN_TOKEN_PREFIX = 'login-';
const API_TOKEN_PREFIX = 'api-';

if (AUTH_METHOD === 'ldap') {
    console.log('Use ldap auth');
} else {
    console.log(`Use local auth file ${LOCAL_AUTH_FILE}`);
}

var tokenStore = {
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
        callback(null, Object.keys(tokenStore.data).filter(function (t) { return t.indexOf(API_TOKEN_PREFIX) === 0; }))
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
    console.log(`Using tokenstore file: ${TOKENSTORE_FILE}`);
    tokenStore.data = JSON.parse(fs.readFileSync(TOKENSTORE_FILE, 'utf-8'));
} catch (e) {
    // start with empty token store
}

function verifyUser(username, password, callback) {
    if (AUTH_METHOD === 'ldap') {
        var ldapClient = ldapjs.createClient({ url: process.env.CLOUDRON_LDAP_URL });
        ldapClient.on('error', function (error) {
            console.error('LDAP error', error);
        });

        ldapClient.bind(process.env.CLOUDRON_LDAP_BIND_DN, process.env.CLOUDRON_LDAP_BIND_PASSWORD, function (error) {
            if (error) return callback(error);

            var filter = `(|(uid=${username})(mail=${username})(username=${username})(sAMAccountName=${username}))`;
            ldapClient.search(process.env.CLOUDRON_LDAP_USERS_BASE_DN, { filter: filter }, function (error, result) {
                if (error) return callback(error);

                var items = [];

                result.on('searchEntry', function(entry) { items.push(entry.object); });
                result.on('error', callback);
                result.on('end', function (result) {
                    if (result.status !== 0 || items.length === 0) return callback('Invalid credentials');

                    // pick the first found
                    var user = items[0];

                    ldapClient.bind(user.dn, password, function (error) {
                        if (error) return callback('Invalid credentials');

                        callback(null, { username: username });
                    });
                });
            });
        });
    } else {
        var users = safe.JSON.parse(safe.fs.readFileSync(LOCAL_AUTH_FILE));
        if (!users || !users[username]) return callback('Invalid credentials');

        bcrypt.compare(password, users[username].passwordHash, function (error, valid) {
            if (error || !valid) return callback('Invalid credentials');

            callback(null, { username: username });
        });
    }
}

exports.login = function (req, res, next) {
    verifyUser(req.body.username, req.body.password, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid credentials'));

        var accessToken = LOGIN_TOKEN_PREFIX + uuid();

        tokenStore.set(accessToken, user, function (error) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(201, { accessToken: accessToken, user: user }));
        });
    });
};

exports.verify = function (req, res, next) {
    var accessToken = req.query.access_token || req.body.accessToken;

    tokenStore.get(accessToken, function (error, user) {
        if (error) return next(new HttpError(401, 'Invalid Access Token'));

        req.user = user;

        next();
    });

};

exports.logout = function (req, res, next) {
    var accessToken = req.query.access_token || req.body.accessToken;

    tokenStore.del(accessToken, function (error) {
        if (error) console.error(error);

        next(new HttpSuccess(200, {}));
    });
};

exports.getProfile = function (req, res, next) {
    next(new HttpSuccess(200, { username: req.user.username }));
};

exports.getTokens = function (req, res, next) {
    tokenStore.getApiTokens(function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { accessTokens: result }));
    });
};

exports.createToken = function (req, res, next) {
    var accessToken = API_TOKEN_PREFIX + uuid();

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
function WebdavUserManager() {};

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

WebdavUserManager.prototype.getUserByNamePassword = function (username, password, callback) {
    verifyUser(username, password, function (error, user) {
        if (error) return callback(webdavErrors.UserNotFound);

        callback(null, {
            username: user.username,
            isAdministrator: true,
            isDefaultUser: false,
            uid: user.username
        });
    });
};
