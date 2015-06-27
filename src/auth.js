'use strict';

var passport = require('passport'),
    LdapStrategy = require('passport-ldapjs').Strategy;

passport.serializeUser(function (user, done) {
    console.log('serializeUser', user);
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    console.log('deserializeUser', id);
    done(null, { id: id });
});

var LDAP_URL = process.env.LDAP_URL;
var LDAP_USERS_BASE_DN = process.env.LDAP_USERS_BASE_DN;

if (LDAP_URL && LDAP_USERS_BASE_DN) {
    console.log('Enable ldap auth');

    exports.ldap = passport.authenticate('ldap');
} else {
    exports.ldap = function (req, res, next) {
        console.log('Disable ldap auth, use developer credentials!');

        if (req.query.username !== 'username') return res.send(401);
        if (req.query.password !== 'password') return res.send(401);

        next();
    };
}

var opts = {
    server: {
        url: LDAP_URL,
    },
    base: LDAP_USERS_BASE_DN,
    search: {
        filter: '(uid={{username}})',
        attributes: ['displayname', 'username', 'mail', 'uid'],
        scope: 'sub'
    },
    uidTag: 'cn',
    usernameField: 'username',
    passwordField: 'password',
};

passport.use(new LdapStrategy(opts, function (profile, done) {
    console.log('ldap', profile);
    done(null, profile);
}));
