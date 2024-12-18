#!/usr/bin/env node

/* jshint esversion: 8 */
/* global describe */
/* global before */
/* global after */
/* global it */

'use strict';

require('chromedriver');

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    superagent = require('superagent'),
    { Builder, By, until } = require('selenium-webdriver'),
    { Options } = require('selenium-webdriver/chrome');

if (!process.env.USERNAME || !process.env.PASSWORD) {
    console.log('USERNAME and PASSWORD env vars need to be set');
    process.exit(1);
}

describe('Application life cycle test', function () {
    this.timeout(0);

    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };
    const LOCATION = 'test';
    const TEST_TIMEOUT = 10000;
    const TEST_FILE_NAME_0 = 'index.html';
    const TEST_FILE_NAME_1 = 'test.txt';
    const SPECIAL_FOLDER_NAME_0 = 'Tâm Tình Với Bạn';
    const SPECIAL_FOLDER_NAME_1 = '? ! + #';
    let CLI;
    const USERNAME = process.env.USERNAME;
    const PASSWORD = process.env.PASSWORD;

    var browser;
    var app;
    var gApiToken;

    before(function () {
        browser = new Builder().forBrowser('chrome').setChromeOptions(new Options().windowSize({ width: 1280, height: 1024 })).build();
        execSync('npm install -g cloudron-surfer', { stdio: 'inherit' });
        const prefix = execSync('npm config get prefix', { encoding: 'utf8' });
        CLI = `${prefix}/bin/surfer`;
    });

    after(function () {
        browser.quit();
    });

    function getAppInfo() {
        var inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(function (a) { return a.location.indexOf(LOCATION) === 0; })[0];
        expect(app).to.be.an('object');
    }

    async function waitForElement(elem) {
        await browser.wait(until.elementLocated(elem), TEST_TIMEOUT);
        await browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT);
    }

    async function login(session = true) {
        await browser.manage().deleteAllCookies();
        await browser.get(`https://${app.fqdn}/_admin`);

        // let the redirects happen
        await browser.sleep(5000);

        if (!session) {
            await waitForElement(By.id('inputUsername'));
            await browser.findElement(By.id('inputUsername')).sendKeys(USERNAME);
            await browser.findElement(By.id('inputPassword')).sendKeys(PASSWORD);
            await browser.findElement(By.id('loginSubmitButton')).click();
        }

        await waitForElement(By.id('burgerMenuButton'));
    }

    async function logout() {
        await browser.get(`https://${app.fqdn}/_admin`);

        await waitForElement(By.id('burgerMenuButton'));
        await browser.findElement(By.id('burgerMenuButton')).click();

        // wait for open animation
        await browser.sleep(1000);

        await waitForElement(By.xpath('//div[@class="pankow-menu-item"][text() = "Logout"]'));
        await browser.findElement(By.xpath('//div[@class="pankow-menu-item"][text() = "Logout"]')).click();

        // let it happen
        await browser.sleep(2000);
    }

    async function checkFileIsListed(name) {
        await browser.get(`https://${app.fqdn}/_admin`);

        await waitForElement(By.xpath('//*[text()="' + name + '"]'));
    }

    async function checkFileIsPresent() {
        await browser.get(`https://${app.fqdn}/${TEST_FILE_NAME_0}`);

        await waitForElement(By.xpath('//*[text()="test"]'));
    }

    async function checkIndexFileIsServedUp() {
        await browser.get(`https://${app.fqdn}`);

        await waitForElement(By.xpath('//*[text()="test"]'));
    }

    function checkFileIsGone(name, done) {
        superagent.get(`https://${app.fqdn}/${name}`).end(function (error, result) {
            expect(error).to.be.an('object');
            expect(error.response.status).to.equal(404);
            expect(result).to.be.an('object');
            done();
        });
    }

    async function checkFileInFolder() {
        const encodedSpecialFilepath = `/testfiles/%3F%20!%20%2B%20%23folder/Fancy%20-%20%2B!%22%23%24%26'()*%2B%2C%3A%3B%3D%3F%40%20-%20Filename`;
        const result = await superagent.get(`https://${app.fqdn}${encodedSpecialFilepath}`);
        expect(result.statusCode).to.equal(200);
    }

    async function createSpecialFolders() {
        const res0 = await superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}`)
            .query({ access_token: gApiToken, directory: true }).send({});
        expect(res0.statusCode).to.equal(201);

        const res1 = await superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}/${encodeURIComponent(SPECIAL_FOLDER_NAME_1)}`)
            .query({ access_token: gApiToken, directory: true });
        expect(res1.statusCode).to.equal(201);
    }

    async function checkFilesInSpecialFolder() {
        await browser.get(`https://${app.fqdn}/${SPECIAL_FOLDER_NAME_0}`);

        await waitForElement(By.xpath(`//a[text()="${SPECIAL_FOLDER_NAME_1}"]`));
    }

    async function enablePublicFolderListing() {
        const res0 = await superagent.put(`https://${app.fqdn}/api/settings`)
            .query({ access_token: gApiToken })
            .send({"folderListingEnabled":true,"sortFoldersFirst":true,"title":"Surfer","index":"","accessRestriction":""});
        expect(res0.statusCode).to.equal(201);
    }

    function cliLogin() {
        execSync(`${CLI} config --server https://${app.fqdn} --token ${gApiToken}`, { stdio: 'inherit' });
    }

    async function createApiToken() {
        await browser.get(`https://${app.fqdn}/_admin`);

        await waitForElement(By.id('burgerMenuButton'));
        await browser.findElement(By.id('burgerMenuButton')).click();

        // wait for open animation
        await browser.sleep(1000);

        await waitForElement(By.xpath('//div[@class="pankow-menu-item"][text() = "Access Tokens"]'));
        await browser.findElement(By.xpath('//div[@class="pankow-menu-item"][text() = "Access Tokens"]')).click();

        await waitForElement(By.xpath('//a[text() = "Create New Access Token"]'));
        await browser.findElement(By.xpath('//a[text() = "Create New Access Token"]')).click();

        // will easily break
        await waitForElement(By.xpath('//div[@class = "pankow-dialog-body"]/div/div/span'));
        gApiToken = await browser.findElement(By.xpath('//div[@class = "pankow-dialog-body"]/div/div/span')).getText();

        expect(gApiToken).to.be.a('string');
        expect(gApiToken).to.not.be.empty();
    }

    function uploadFile(name, target = '/') {
        // File upload can't be tested with selenium, since the file input is not visible and thus can't be interacted with :-(
        execSync(`${CLI} put ${path.join(__dirname, name)} ${target}`,  { stdio: 'inherit' } );
    }

    function uploadFileWithToken(name) {
        // File upload can't be tested with selenium, since the file input is not visible and thus can't be interacted with :-(
        execSync(`${CLI} put --token ${gApiToken} ${path.join(__dirname, name)} /`,  { stdio: 'inherit' } );
    }

    function uploadFolder() {
        execSync(`${CLI} put ${path.join(__dirname, 'testfiles')} /`,  { stdio: 'inherit' } );
    }

    function checkFolderExists() {
        var result;
        result = execSync(`${CLI} get`).toString();
        expect(result.indexOf('test/')).to.not.equal(-1);
        result = execSync(`${CLI} get test/`).toString();
        expect(result.indexOf('04 - Wormlust - Sex Augu, Tólf Stjörnur.flac')).to.not.equal(-1);
    }

    function checkFolderIsGone() {
        var result;
        result = execSync(`${CLI} get`).toString();
        expect(result.indexOf('test/')).to.equal(-1);
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync(`cloudron install --location ${LOCATION}`, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can login', login.bind(null, false));
    it('can create api token', createApiToken);
    it('can cli login', cliLogin);
    it('can upload file', uploadFile.bind(null, TEST_FILE_NAME_0));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('can upload folder', uploadFolder);
    it('special file in folder exists', checkFileInFolder);
    it('can create special folder names', createSpecialFolders);
    it('can enable public folder listing', enablePublicFolderListing);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can upload second file with token', uploadFileWithToken.bind(null, TEST_FILE_NAME_1));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_1));
    it('can delete second file with cli', function () {
        execSync(`${CLI} del ${TEST_FILE_NAME_1}`,  { stdio: 'inherit' });
    });
    it('second file is gone', checkFileIsGone.bind(null, TEST_FILE_NAME_1));
    it('can upload folder', uploadFile.bind(null, 'testfiles/*', '/test/'));
    it('folder exists', checkFolderExists);

    it('can logout', logout);

    it('backup app', function () { execSync(`cloudron backup create --app ${app.id}`, EXEC_ARGS); });
    it('restore app', function () {
        const backups = JSON.parse(execSync(`cloudron backup list --raw --app ${app.id}`));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('second file is still gone', checkFileIsGone.bind(null, TEST_FILE_NAME_1));
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('folder exists', checkFolderExists);
    it('can logout', logout);

    it('move to different location', async function () {
        browser.manage().deleteAllCookies();

        // ensure we don't hit NXDOMAIN in the mean time
        await browser.get('about:blank');

        execSync(`cloudron configure --location ${LOCATION}2 --app ${app.id}`, EXEC_ARGS);
    });
    it('can get app information', getAppInfo);

    it('can login', login);
    it('can cli login', cliLogin);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('folder exists', checkFolderExists);
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can delete folder', function () { execSync(`${CLI}  del --recursive test`,  { stdio: 'inherit' }); });
    it('folder is gone', checkFolderIsGone);
    it('can logout', logout);

    it('uninstall app', async function () {
        // ensure we don't hit NXDOMAIN in the mean time
        await browser.get('about:blank');

        execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS);
    });

    // test update
    it('can install app', function () { execSync(`cloudron install --appstore-id io.cloudron.surfer --location ${LOCATION}`, EXEC_ARGS); });

    it('can get app information', getAppInfo);
    it('can login', login);
    it('can create api token', createApiToken);
    it('can cli login', cliLogin);
    it('can upload file', uploadFile.bind(null, TEST_FILE_NAME_0));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('can create special folder names', createSpecialFolders);
    it('can enable public folder listing', enablePublicFolderListing);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can upload folder', uploadFolder);
    it('can logout', logout);

    it('can update', function () { execSync(`cloudron update --app ${LOCATION}`, EXEC_ARGS); });

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can logout', logout);

    it('uninstall app', async function () {
        // ensure we don't hit NXDOMAIN in the mean time
        await browser.get('about:blank');

        execSync(`cloudron uninstall --app ${app.id}`, EXEC_ARGS);
    });
});
