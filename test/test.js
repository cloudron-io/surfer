#!/usr/bin/env node

'use strict';

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    superagent = require('superagent');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

describe('Application life cycle test', function () {
    this.timeout(0);
    var LOCATION = 'surfertest';
    var app, testFile = os.tmpdir() + '/surfer-test.txt';
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

    it('build app', function () {
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

    it('can login using cli', function () {
        // execSync(__dirname + '/../cli/surfer.js login https://' + app.fqdn, { input: username + '\n' + password + '\n' });
        fs.writeFileSync(process.env.HOME + '/.surfer.json', JSON.stringify({ server: 'https://' + app.fqdn, username: username, password: password }));
    });

    it('can upload file', function (done) {
        fs.writeFileSync(testFile, 'surfer');
        execSync(__dirname + '/../cli/surfer.js put ' + testFile,  { stdio: 'inherit' } );
        done();
    });

    it('backup app', function () {
        execSync('cloudron backup --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('restore app', function () {
        execSync('cloudron restore --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('can get the uploaded file', function (done) {
        var contents = execSync(__dirname + '/../cli/surfer.js get surfer-test.txt').toString('utf8');
        expect(contents).to.be('surfer');
        done();
    });

    it('uninstall app', function () {
        execSync('cloudron uninstall --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
        fs.unlinkSync(process.env.HOME + '/.surfer.json');
        fs.unlinkSync(testFile);
    });
});
