/* global it, describe, before, after, afterEach */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';

import superagent from '@cloudron/superagent';

import { app, clearCache, click, cloudronCli, getText, goto, loginOIDC, setupBrowser, takeScreenshot, teardownBrowser, waitFor } from '@cloudron/charlie';

describe('Application life cycle test', function () {
    const TEST_FILE_NAME_0 = 'index.html';
    const TEST_FILE_NAME_1 = 'test.txt';
    const SPECIAL_FOLDER_NAME_0 = 'Tâm Tình Với Bạn';
    const SPECIAL_FOLDER_NAME_1 = '? ! + #';
    /** @type {string} */
    let CLI;
    /** @type {string} */
    let gApiToken;

    before(function () {
        const appRoot = path.resolve(import.meta.dirname, '..');
        execSync('npm install -g .', { cwd: appRoot, stdio: 'inherit' });
        const prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
        CLI = `${prefix}/bin/surfer`;
        console.log('surfer cli is probably at', CLI);
    });
    before(setupBrowser);
    after(teardownBrowser);

    afterEach(async function () {
        await takeScreenshot(this.currentTest);
    });

    async function loginNoIndex() { // when no nidex page, the default page shows login
        await goto(`https://${app.fqdn}/`, /Log in|Login/);
        await click(/Log in|Login/);
        await loginOIDC('Upload file');
    }

    async function login() {
        await goto(`https://${app.fqdn}/_admin`,/Log in|Login/);
        await click(/Log in|Login/);
        await loginOIDC('Upload file');
    }

    async function logout() {
        await clearCache();
    }

    async function checkFileIsListed(name) {
        await goto(`https://${app.fqdn}/_admin`);
        await waitFor(name);
    }

    async function checkFileIsPresent() {
        await goto(`https://${app.fqdn}/${TEST_FILE_NAME_0}`);
        await waitFor('test');
    }

    async function checkIndexFileIsServedUp() {
        await goto(`https://${app.fqdn}`);
        await waitFor('test');
    }

    async function checkFileIsGone(name) {
        const res = await superagent.get(`https://${app.fqdn}/${name}`).ok(() => true);
        assert.strictEqual(res.status, 404);
    }

    async function checkFileInFolder() {
        const encodedSpecialFilepath = `/testfiles/%3F%20!%20%2B%20%23folder/Fancy%20-%20%2B!%22%23%24%26'()*%2B%2C%3A%3B%3D%3F%40%20-%20Filename`;
        const result = await superagent.get(`https://${app.fqdn}${encodedSpecialFilepath}`).ok(() => true);
        assert.strictEqual(result.status, 200);
    }

    async function createSpecialFolders() {
        const res0 = await superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}`)
            .query({ access_token: gApiToken, directory: true }).send({}).ok(() => true);
        assert.strictEqual(res0.status, 201);

        const res1 = await superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}/${encodeURIComponent(SPECIAL_FOLDER_NAME_1)}`)
            .query({ access_token: gApiToken, directory: true }).ok(() => true);
        assert.strictEqual(res1.status, 201);
    }

    async function checkFilesInSpecialFolder() {
        await goto(`https://${app.fqdn}/${SPECIAL_FOLDER_NAME_0}`);
        await waitFor(SPECIAL_FOLDER_NAME_1);
    }

    async function enablePublicFolderListing() {
        const res0 = await superagent.put(`https://${app.fqdn}/api/settings`)
            .query({ access_token: gApiToken })
            .send({ folderListingEnabled: true, sortFoldersFirst: true, title: 'Surfer', index: '', accessRestriction: '' }).ok(() => true);
        assert.strictEqual(res0.status, 201);
    }

    function cliLogin() {
        execSync(`${CLI} config --server https://${app.fqdn} --token ${gApiToken}`, { stdio: 'inherit' });
    }

    async function createApiToken() {
        await goto(`https://${app.fqdn}/_admin`);

        await click('tooltip=Menu');
        await click(/Access tokens/);
        await click('Create new access token');

        await waitFor(/^api/);
        gApiToken = await getText(/^api/);

        assert.strictEqual(typeof gApiToken, 'string');
        assert.ok(gApiToken.length > 0);
    }

    function uploadFile(name, target = '/') {
        execSync(`${CLI} put ${path.join(import.meta.dirname, name)} ${target}`, { stdio: 'inherit' });
    }

    function uploadFileWithToken(name) {
        execSync(`${CLI} put --token ${gApiToken} ${path.join(import.meta.dirname, name)} /`, { stdio: 'inherit' });
    }

    function uploadFolder() {
        execSync(`${CLI} put ${path.join(import.meta.dirname, 'testfiles')} /`, { stdio: 'inherit' });
    }

    function checkFolderExists() {
        let result = execSync(`${CLI} get`).toString();
        assert.notStrictEqual(result.indexOf('test/'), -1);
        result = execSync(`${CLI} get test/`).toString();
        assert.notStrictEqual(result.indexOf('04 - Wormlust - Sex Augu, Tólf Stjörnur.flac'), -1);
    }

    function checkFolderIsGone() {
        const result = execSync(`${CLI} get`).toString();
        assert.strictEqual(result.indexOf('test/'), -1);
    }

    it('install app', cloudronCli.install);

    it('can login', loginNoIndex);
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
        execSync(`${CLI} del ${TEST_FILE_NAME_1}`, { stdio: 'inherit' });
    });
    it('second file is gone', async () => checkFileIsGone(TEST_FILE_NAME_1));
    it('can upload folder', uploadFile.bind(null, 'testfiles/*', '/test/'));
    it('folder exists', checkFolderExists);

    it('can logout', logout);

    it('backup app', cloudronCli.createBackup);
    it('restore app', cloudronCli.restoreFromLatestBackup);

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('second file is still gone', async () => checkFileIsGone(TEST_FILE_NAME_1));
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('folder exists', checkFolderExists);
    it('can logout', logout);

    it('move to different location', cloudronCli.changeLocation);

    it('can login', login);
    it('can cli login', cliLogin);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('folder exists', checkFolderExists);
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can delete folder', function () {
        execSync(`${CLI}  del --recursive test`, { stdio: 'inherit' });
    });
    it('folder is gone', checkFolderIsGone);
    it('can logout', logout);

    it('uninstall app', cloudronCli.uninstall);

    it('can install app', cloudronCli.appstoreInstall);

    it('can login', loginNoIndex);
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

    it('can update', cloudronCli.update);

    it('can login', login);
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_0));
    it('file is served up', checkFileIsPresent);
    it('file is served up', checkIndexFileIsServedUp);
    it('special file in folder exists', checkFileInFolder);
    it('special folder names allow public listings', checkFilesInSpecialFolder);
    it('can logout', logout);

    it('uninstall app', cloudronCli.uninstall);
});
