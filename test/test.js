#!/usr/bin/env node

'use strict';

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    util = require('util'),
    fs = require('fs'),
    superagent = require('superagent'),
    webdriver = require('selenium-webdriver');

var by = webdriver.By,
    Keys = webdriver.Key,
    until = webdriver.until;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

if (!process.env.USERNAME || !process.env.PASSWORD) {
    console.log('USERNAME and PASSWORD env vars need to be set');
    process.exit(1);
}

describe('Application life cycle test', function () {
    this.timeout(0);

    var chrome = require('selenium-webdriver/chrome');
    var server, browser = new chrome.Driver();

    before(function (done) {
        var seleniumJar= require('selenium-server-standalone-jar');
        var SeleniumServer = require('selenium-webdriver/remote').SeleniumServer;
        server = new SeleniumServer(seleniumJar.path, { port: 4444 });
        server.start();

        done();
    });

    after(function (done) {
        browser.quit();
        server.stop();
        done();
    });

    var LOCATION = 'test';
    var TEST_TIMEOUT = 10000;
    var TEST_FILE_NAME_0 = 'index.html';
    var TEST_FILE_NAME_1 = 'test.txt';
    var app;

    // tests which are used more than once
    function login(done) {
        browser.manage().deleteAllCookies();
        browser.get('https://' + app.fqdn + '/_admin');

        browser.wait(until.elementLocated(by.id('inputUsername')), TEST_TIMEOUT).then(function () {
            browser.wait(until.elementIsVisible(browser.findElement(by.id('inputUsername'))), TEST_TIMEOUT).then(function () {
                browser.findElement(by.id('inputUsername')).sendKeys(process.env.USERNAME);
                browser.findElement(by.id('inputPassword')).sendKeys(process.env.PASSWORD);
                browser.findElement(by.id('loginForm')).submit();

                browser.wait(until.elementIsVisible(browser.findElement(by.id('logoutButton'))), TEST_TIMEOUT).then(function () {
                    done();
                });
            });
        });
    }

    function logout(done) {
        browser.get('https://' + app.fqdn + '/_admin');

        browser.wait(until.elementLocated(by.id('logoutButton')), TEST_TIMEOUT).then(function () {
            browser.wait(until.elementIsVisible(browser.findElement(by.id('logoutButton'))), TEST_TIMEOUT).then(function () {
                browser.findElement(by.id('logoutButton')).click();

                browser.wait(until.elementIsVisible(browser.findElement(by.id('inputPassword'))), TEST_TIMEOUT).then(function () {
                    done();
                });
            });
        });
    }

    function checkFileIsListed(name, done) {
        browser.get('https://' + app.fqdn + '/_admin');

        browser.wait(until.elementLocated(by.xpath('//*[text()="' + name + '"]')), TEST_TIMEOUT).then(function () {
            done();
        });
    }

    function checkFileIsPresent(done) {
        browser.get('https://' + app.fqdn + '/' + TEST_FILE_NAME_0);

        browser.wait(until.elementLocated(by.xpath('//*[text()="test"]')), TEST_TIMEOUT).then(function () {
            done();
        });
    }

    function checkIndexFileIsServedUp(done) {
        browser.get('https://' + app.fqdn);

        browser.wait(until.elementLocated(by.xpath('//*[text()="test"]')), TEST_TIMEOUT).then(function () {
            done();
        });
    }

    function checkFileIsGone(name, done) {
        superagent.get('https://' + app.fqdn + '/' + name).end(function (error, result) {
            expect(error).to.be.an('object');
            expect(result.statusCode).to.equal(404);
            done();
        });
    }

    function cliLogin(done) {
        execSync(util.format('%s login %s --username %s --password %s', path.join(__dirname, '/../cli/surfer.js'), app.fqdn, process.env.USERNAME, process.env.PASSWORD),  { stdio: 'inherit' } );
        done();
    }

    function uploadFile(name, done) {
        // File upload can't be tested with selenium, since the file input is not visible and thus can't be interacted with :-(

        execSync(path.join(__dirname, '/../cli/surfer.js') + ' put ' + path.join(__dirname, name),  { stdio: 'inherit' } );
        done();
    }

    xit('build app', function () {
        execSync('cloudron build', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('install app', function () {
        execSync('cloudron install --new --wait --location ' + LOCATION, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('can get app information', function () {
        var inspect = JSON.parse(execSync('cloudron inspect'));

        app = inspect.apps.filter(function (a) { return a.location === LOCATION; })[0];

        expect(app).to.be.an('object');
    });

    it('can login', login);
    it('can cli login', cliLogin);
    it('can upload file', uploadFile.bind(null, TEST_FILE_NAME_0));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('can upload second file', uploadFile.bind(null, TEST_FILE_NAME_1));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_1));
    it('can delete second file with cli', function (done) {
        execSync(path.join(__dirname, '/../cli/surfer.js') + ' del ' + TEST_FILE_NAME_1,  { stdio: 'inherit' } );
        done();
    });
    it('second file is gone', checkFileIsGone.bind(null, TEST_FILE_NAME_1));
    it('can logout', logout);

    it('backup app', function () {
        execSync('cloudron backup create --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('restore app', function () {
        execSync('cloudron restore --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('second file is still gone', checkFileIsGone.bind(null, TEST_FILE_NAME_1));
    it('can logout', logout);

    it('move to different location', function () {
        browser.manage().deleteAllCookies();
        execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
        var inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(function (a) { return a.location === LOCATION + '2'; })[0];
        expect(app).to.be.an('object');
    });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('can logout', logout);

    it('uninstall app', function () {
        execSync('cloudron uninstall --app ' + app.id, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    });
});
