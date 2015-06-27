'use strict';

var passport = require('passport'),
    LdapStrategy = require('passport-ldapjs').Strategy;

var LDAP_URL = process.env.LDAP_URL;
var LDAP_USERS_BASE_DN = process.env.LDAP_USERS_BASE_DN;

if (LDAP_URL && LDAP_USERS_BASE_DN) {
    console.log('Enable ldap auth');

    exports.ldap = passport.authenticate('ldap', {
        successReturnToOrRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true
    });
} else {
    exports.ldap = function (req, res, next) {
        console.log('ldap auth disabled');
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
    uidTag: 'uid',
    usernameField: 'username',
    passwordField: 'password',
};

passport.use(new LdapStrategy(opts, function (profile, done) {
    console.log('ldap', profile);
    done(null, profile);
}));
