'use strict';

var passport = require('passport'),
    path = require('path'),
    safe = require('safetydance'),
    bcrypt = require('bcryptjs'),
    LdapStrategy = require('passport-ldapjs').Strategy;

var LOCAL_AUTH_FILE = path.resolve(process.env.LOCAL_AUTH_FILE || './.users.json');

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

    exports.verify = passport.authenticate('ldap');
} else {
    console.log('Use local user file:', LOCAL_AUTH_FILE);

    exports.verify = function (req, res, next) {
        var users = safe.JSON.parse(safe.fs.readFileSync(LOCAL_AUTH_FILE));
        if (!users) return res.send(401);
        if (!users[req.query.username]) return res.send(401);

        bcrypt.compare(req.query.password, users[req.query.username].passwordHash, function (error, valid) {
            if (error || !valid) return res.send(401);
            next();
        });
    };
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
