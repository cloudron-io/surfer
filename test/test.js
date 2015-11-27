#!/usr/bin/env node

'use strict';

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    superagent = require('superagent');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

describe('Application life cycle test', function () {
    this.timeout(0);
    var LOCATION = 'surfertest';
    var app;
    var username = process.env.USERNAME;
    var password = process.env.PASSWORD;

    before(function (done) {
        if (!process.env.USERNAME) return done(new Error('USERNAME env var not set'));
        if (!process.env.PASSWORD) return done(new Error('PASSWORD env var not set'));

        done();
    });

    after(function (done) {
        done();
    });

    xit('build app', function () {
        execSync('cloudron build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('install app', function () {
        execSync('cloudron install --new --location ' + LOCATION, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('can get app information', function () {
        var inspect = JSON.parse(execSync('cloudron inspect'));

        app = inspect.apps.filter(function (a) { return a.location === LOCATION; })[0];

        expect(app).to.be.an('object');
    });

    it('can get the main page', function (done) {
        superagent.get('https://' + app.fqdn).end(function (error, result) {
            expect(error).to.be(null);
            expect(result.status).to.eql(200);

            done();
        });
    });

    it('can login using cli', function (done) {
        execSync(__dirname + '../cli/surfer.js login https://' + app.fqdn, { input: username + '\n' + password + '\n' });
        done();
    });

    it('can upload file', function (done) {
        execSync(__dirname + '../cli/surfer.js put test.js');
        done();
    });

    it('backup app', function () {
        execSync('cloudron backup --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('restore app', function () {
        execSync('cloudron restore --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('can get the uploaded file', function (done) {
        var testFile = execSync(__dirname + '../cli/surfer.js get test.js').toString('utf8');
        console.log(testFile);
        done();
    });

    xit('uninstall app', function () {
        execSync('cloudron uninstall --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });
});
