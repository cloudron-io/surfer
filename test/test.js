#!/usr/bin/env node

'use strict';

/* global describe */
/* global before */
/* global after */
/* global it */

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    util = require('util'),
    superagent = require('superagent'),
    webdriver = require('selenium-webdriver');

var by = webdriver.By,
    until = webdriver.until;

if (!process.env.USERNAME || !process.env.PASSWORD) {
    console.log('USERNAME and PASSWORD env vars need to be set');
    process.exit(1);
}

const EXEC_OPTIONS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };

describe('Application life cycle test', function () {
    this.timeout(0);

    var browser;

    before(function (done) {
        browser = new webdriver.Builder()
          .forBrowser('chrome')
        //   .setChromeOptions(new chrome.Options().addArguments(['no-sandbox', 'headless']))
          .build();

        done();
    });

    after(function (done) {
        browser.quit();
        done();
    });

    var LOCATION = 'test';
    var TEST_TIMEOUT = 10000;
    var TEST_FILE_NAME_0 = 'index.html';
    var TEST_FILE_NAME_1 = 'test.txt';
    var app;

    function waitForElement(elem) {
        return browser.wait(until.elementLocated(elem), TEST_TIMEOUT).then(function () {
            return browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT);
        });
    }

    // tests which are used more than once
    function login(done) {
        browser.manage().deleteAllCookies();
        browser.get('https://' + app.fqdn + '/_admin');

        waitForElement(by.id('loginUsernameInput')).then(function () {
            browser.findElement(by.id('loginUsernameInput')).sendKeys(process.env.USERNAME);
            browser.findElement(by.id('loginPasswordInput')).sendKeys(process.env.PASSWORD);
            browser.findElement(by.id('loginSubmitButton')).click();

            waitForElement(by.id('burgerMenuButton')).then(function () {
                done();
            });
        });
    }

    function logout(done) {
        browser.get('https://' + app.fqdn + '/_admin');

        waitForElement(by.id('burgerMenuButton')).then(function () {
            browser.findElement(by.id('burgerMenuButton')).click();

            // wait for open animation
            browser.sleep(5000);

            waitForElement(by.id('logoutButton')).then(function () {
                browser.findElement(by.id('logoutButton')).click();

                waitForElement(by.id('loginUsernameInput')).then(function () {
                    done();
                });
            });
        });
    }

    function checkFileIsListed(name, done) {
        browser.get('https://' + app.fqdn + '/_admin');

        waitForElement(by.xpath('//*[text()="' + name + '"]')).then(function () {
            done();
        });
    }

    function checkFileIsPresent(done) {
        browser.get('https://' + app.fqdn + '/' + TEST_FILE_NAME_0);

        waitForElement(by.xpath('//*[text()="test"]')).then(function () {
            done();
        });
    }

    function checkIndexFileIsServedUp(done) {
        browser.get('https://' + app.fqdn);

        waitForElement(by.xpath('//*[text()="test"]')).then(function () {
            done();
        });
    }

    function checkFileIsGone(name, done) {
        superagent.get('https://' + app.fqdn + '/' + name).end(function (error, result) {
            expect(error).to.be.an('object');
            expect(error.response.status).to.equal(404);
            expect(result).to.be.an('object');
            done();
        });
    }

    function cliLogin(done) {
        execSync(util.format('%s login %s --username %s --password %s', path.join(__dirname, '/../cli/surfer.js'), app.fqdn, process.env.USERNAME, process.env.PASSWORD),  { stdio: 'inherit' } );
        done();
    }

    function uploadFile(name, done) {
        // File upload can't be tested with selenium, since the file input is not visible and thus can't be interacted with :-(

        execSync(path.join(__dirname, '/../cli/surfer.js') + ' put ' + path.join(__dirname, name) + '/',  { stdio: 'inherit' } );
        done();
    }

    xit('build app', function () {
        execSync('cloudron build', EXEC_OPTIONS);
    });

    it('install app', function () {
        execSync('cloudron install --new --wait --location ' + LOCATION, EXEC_OPTIONS);
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
        execSync('cloudron backup create --app ' + app.id, EXEC_OPTIONS);
    });

    it('restore app', function () {
        execSync('cloudron restore --app ' + app.id, EXEC_OPTIONS);
    });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('second file is still gone', checkFileIsGone.bind(null, TEST_FILE_NAME_1));
    it('can logout', logout);

    it('move to different location', function (done) {
        browser.manage().deleteAllCookies();

        // ensure we don't hit NXDOMAIN in the mean time
        browser.get('about:blank').then(function () {
            execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, EXEC_OPTIONS);
            var inspect = JSON.parse(execSync('cloudron inspect'));
            app = inspect.apps.filter(function (a) { return a.location === LOCATION + '2'; })[0];
            expect(app).to.be.an('object');
            done();
        });
    });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('can logout', logout);

    it('uninstall app', function (done) {
        // ensure we don't hit NXDOMAIN in the mean time
        browser.get('about:blank').then(function () {
            execSync('cloudron uninstall --app ' + app.id, EXEC_OPTIONS);
            done();
        });
    });
});
