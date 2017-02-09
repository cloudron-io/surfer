'use strict';

var passport = require('passport'),
    path = require('path'),
    safe = require('safetydance'),
    bcrypt = require('bcryptjs'),
    uuid = require('uuid/v4'),
    redis = require('redis'),
    BearerStrategy = require('passport-http-bearer').Strategy,
    LdapStrategy = require('passport-ldapjs').Strategy,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

var LOCAL_AUTH_FILE = path.resolve(process.env.LOCAL_AUTH_FILE || './.users.json');

var tokenStore = {
    data: {},
    get: function (token, callback) {
        callback(tokenStore.data[token] ? null : 'not found', tokenStore.data[token]);
    },
    set: function (token, data, callback) {
        tokenStore.data[token] = data;
        callback(null);
    },
    del: function (token, callback) {
        delete tokenStore.data[token];
        callback(null);
    }
};

if (process.env.REDIS_URL) {
    console.log('Enable redis token store');

    var redisClient = redis.createClient(process.env.REDIS_URL);

    if (process.env.REDIS_PASSWORD) {
        console.log('Using redis auth');
        redisClient.auth(process.env.REDIS_PASSWORD);
    }

    // overwrite the tokenStore api
    tokenStore.get = function (token, callback) {
        redisClient.get(token, function (error, result) {
            callback(error || null, safe.JSON.parse(result));
        });
    };
    tokenStore.set = function (token, data, callback) {
        redisClient.set(token, JSON.stringify(data), callback);
    };
    tokenStore.del = redisClient.del.bind(redisClient);
} else {
    console.log('Use in-memory token store');
}

function issueAccessToken() {
    return function (req, res, next) {
        var accessToken = uuid();

        tokenStore.set(accessToken, req.user, function (error) {
            if (error) return next(new HttpError(500, error));
            next(new HttpSuccess(201, { accessToken: accessToken, user: req.user }));
        });
    };
}

passport.serializeUser(function (user, done) {
    console.log('serializeUser', user);
    done(null, user.uid);
});

passport.deserializeUser(function (id, done) {
    console.log('deserializeUser', id);
    done(null, { uid: id });
});

var LDAP_URL = process.env.LDAP_URL;
var LDAP_USERS_BASE_DN = process.env.LDAP_USERS_BASE_DN;

if (LDAP_URL && LDAP_USERS_BASE_DN) {
    console.log('Enable ldap auth');

    exports.login = [ passport.authenticate('ldap'), issueAccessToken() ];
} else {
    console.log('Use local user file:', LOCAL_AUTH_FILE);

    exports.login = [
        function (req, res, next) {
            var users = safe.JSON.parse(safe.fs.readFileSync(LOCAL_AUTH_FILE));
            if (!users) return res.send(401);
            if (!users[req.body.username]) return res.send(401);

            bcrypt.compare(req.body.password, users[req.body.username].passwordHash, function (error, valid) {
                if (error || !valid) return res.send(401);

                req.user = {
                    username: req.body.username
                };

                next();
            });
        },
        issueAccessToken()
    ];
}

var opts = {
    server: {
        url: LDAP_URL,
    },
    base: LDAP_USERS_BASE_DN,
    search: {
        filter: '(|(username={{username}})(mail={{username}}))',
        attributes: ['displayname', 'username', 'mail', 'uid'],
        scope: 'sub'
    },
    uidTag: 'cn',
    usernameField: 'username',
    passwordField: 'password',
};

passport.use(new LdapStrategy(opts, function (profile, done) {
    done(null, profile);
}));

exports.verify = passport.authenticate('bearer', { session: false });

passport.use(new BearerStrategy(function (token, done) {
    tokenStore.get(token, function (error, result) {
        if (error) {
            console.error(error);
            return done(null, false);
        }

        done(null, result, { accessToken: token });
    });
}));

exports.logout = function (req, res, next) {
    tokenStore.del(req.authInfo.accessToken, function (error) {
        if (error) console.error(error);

        next(new HttpSuccess(200, {}));
    });
};

exports.getProfile = function (req, res, next) {
    next(new HttpSuccess(200, { username: req.user.username }));
};
