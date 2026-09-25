/* global it, describe, before, after, afterEach */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';

import superagent from '@cloudron/superagent';

import { app, clearCache, click, cloudronCli, createAppPassword, goto, loginOIDC, setupBrowser, takeScreenshot, teardownBrowser, waitFor } from '@cloudron/charlie';

describe('Application life cycle test', function () {
    const APP_ROOT = path.resolve(import.meta.dirname, '..');
    const CLI_SCRIPT = path.join(APP_ROOT, 'cli', 'surfer.js');
    const TEST_FILE_NAME_0 = 'index.html';
    const TEST_FILE_NAME_1 = 'test.txt';
    const SPECIAL_FOLDER_NAME_0 = 'Tâm Tình Với Bạn';
    const SPECIAL_FOLDER_NAME_1 = '? ! + #';
    let gUsername = '';
    let gAppPassword = '';

    before(async function () {
        if (process.env.CI) execSync('npm install', { cwd: APP_ROOT, stdio: 'inherit' });
        console.log('surfer cli script is', CLI_SCRIPT);
        await setupBrowser();
    });
    after(teardownBrowser);

    afterEach(async function () {
        await takeScreenshot(this.currentTest);
    });

    async function loginNoIndex() { // when no nidex page, the default page shows login
        await goto(`https://${app.fqdn}/`, /Log in/);
        await click(/Log in/);
        await loginOIDC('New');
    }

    async function login() {
        await goto(`https://${app.fqdn}/_admin`, /Log in/);
        await click(/Log in/);
        await loginOIDC('New');
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

    function authed(request) {
        return request.auth(gUsername, gAppPassword).ok(() => true);
    }

    async function ensureAppPassword() {
        const created = await createAppPassword('surfer-test-' + Date.now());
        gUsername = created.username;
        gAppPassword = created.password;
    }

    async function createSpecialFolders() {
        const res0 = await authed(superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}`))
            .query({ directory: true }).send({});
        assert.strictEqual(res0.status, 201);

        const res1 = await authed(superagent.post(`https://${app.fqdn}/api/files/${encodeURIComponent(SPECIAL_FOLDER_NAME_0)}/${encodeURIComponent(SPECIAL_FOLDER_NAME_1)}`))
            .query({ directory: true });
        assert.strictEqual(res1.status, 201);
    }

    async function checkFilesInSpecialFolder() {
        await goto(`https://${app.fqdn}/${SPECIAL_FOLDER_NAME_0}`);
        await waitFor(SPECIAL_FOLDER_NAME_1);
    }

    async function enablePublicFolderListing() {
        const res0 = await authed(superagent.put(`https://${app.fqdn}/api/settings`))
            .send({ folderListingEnabled: true, title: 'Surfer', index: '', accessRestriction: '' });
        assert.strictEqual(res0.status, 201);
    }

    function runCli(command, options = {}) {
        // delete charlie hooks in the CI when running CLI
        const env = { ...process.env, ...(options.env || {}) };
        delete env.NODE_OPTIONS;
        delete env.NODE_PATH;

        return execSync(`${process.execPath} ${JSON.stringify(CLI_SCRIPT)} ${command}`, { cwd: APP_ROOT, ...options, env });
    }

    function cliLogin() {
        runCli(`config --server https://${app.fqdn} --username ${JSON.stringify(gUsername)} --password ${JSON.stringify(gAppPassword)}`, { stdio: 'inherit' });
    }

    function uploadFile(name, target = '/') {
        runCli(`put ${path.join(import.meta.dirname, name)} ${target}`, { stdio: 'inherit' });
    }

    function uploadFileWithPassword(name) {
        runCli(`put --username ${JSON.stringify(gUsername)} --password ${JSON.stringify(gAppPassword)} ${path.join(import.meta.dirname, name)} /`, { stdio: 'inherit' });
    }

    function uploadFolder() {
        runCli(`put ${path.join(import.meta.dirname, 'testfiles')} /`, { stdio: 'inherit' });
    }

    function checkFolderExists() {
        let result = runCli('get').toString();
        assert.notStrictEqual(result.indexOf('test/'), -1);
        result = runCli('get test/').toString();
        assert.notStrictEqual(result.indexOf('04 - Wormlust - Sex Augu, Tólf Stjörnur.flac'), -1);
    }

    function checkFolderIsGone() {
        const result = runCli('get').toString();
        assert.strictEqual(result.indexOf('test/'), -1);
    }

    it('install app', cloudronCli.install);

    it('can login', loginNoIndex);
    it('can create app password', ensureAppPassword);
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
    it('can upload second file with app password', uploadFileWithPassword.bind(null, TEST_FILE_NAME_1));
    it('file is listed', checkFileIsListed.bind(null, TEST_FILE_NAME_1));
    it('can delete second file with cli', function () {
        runCli(`del ${TEST_FILE_NAME_1}`, { stdio: 'inherit' });
    });
    it('second file is gone', async () => checkFileIsGone(TEST_FILE_NAME_1));
    it('can upload folder', uploadFile.bind(null, 'testfiles/*', '/test/'));
    it('folder exists', checkFolderExists);

    it('can copy file', async function () {
        const res = await authed(superagent.post(`https://${app.fqdn}/api/copy`))
            .send({ sources: [ '/index.html' ], destination: '/' });
        assert.strictEqual(res.status, 201);

        const list = await authed(superagent.get(`https://${app.fqdn}/api/files/${encodeURIComponent('/')}`));
        assert.ok(list.body.entries.some((e) => e.fileName === 'index (1).html'));
    });

    it('can move file', async function () {
        const res = await authed(superagent.put(`https://${app.fqdn}/api/files/${encodeURIComponent('/index (1).html')}`))
            .send({ newFilePath: '/index-moved.html', overwrite: false });
        assert.strictEqual(res.status, 200);

        const list = await authed(superagent.get(`https://${app.fqdn}/api/files/${encodeURIComponent('/')}`));
        assert.ok(list.body.entries.some((e) => e.fileName === 'index-moved.html'));
    });

    it('cannot overwrite on move', async function () {
        const res = await authed(superagent.put(`https://${app.fqdn}/api/files/${encodeURIComponent('/index-moved.html')}`))
            .send({ newFilePath: '/index.html', overwrite: false });
        assert.strictEqual(res.status, 409);
    });

    it('can extract zip archive', async function () {
        const res = await authed(superagent.post(`https://${app.fqdn}/api/extract`))
            .send({ path: '/test/archive.zip' });
        assert.strictEqual(res.status, 200);

        const file = await superagent.get(`https://${app.fqdn}/test/a.txt`).ok(() => true);
        assert.strictEqual(file.status, 200);
        assert.strictEqual(file.text, 'hello zip\n');
    });

    it('can extract tar archive', async function () {
        const res = await authed(superagent.post(`https://${app.fqdn}/api/extract`))
            .send({ path: '/test/archive.tar.gz' });
        assert.strictEqual(res.status, 200);

        const file = await superagent.get(`https://${app.fqdn}/test/sub/b.txt`).ok(() => true);
        assert.strictEqual(file.status, 200);
        assert.strictEqual(file.text, 'hello sub\n');
    });

    it('can delete moved file', async function () {
        const res = await authed(superagent.del(`https://${app.fqdn}/api/files/${encodeURIComponent('/index-moved.html')}`));
        assert.strictEqual(res.status, 200);
    });

    it('can logout', logout);

    it('backup app', cloudronCli.createBackup);
    it('restore app', cloudronCli.restoreFromLatestBackup);

    it('can create app password', ensureAppPassword);
    it('can cli login', cliLogin);

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
        runCli('del --recursive test', { stdio: 'inherit' });
    });
    it('folder is gone', checkFolderIsGone);
    it('can logout', logout);

    it('uninstall app', cloudronCli.uninstall);

    it('can install app for update', cloudronCli.appstoreInstall);
  
    it('can login', loginNoIndex);
    it('can create app password', ensureAppPassword);
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
  
    it('can deploy a directory', function () {
        runCli(`deploy ${JSON.stringify(path.join(import.meta.dirname, 'deploy-site'))}`, { stdio: 'inherit' });
    });
    it('deployed site is served', async function () {
        const deployed = await superagent.get(`https://${app.fqdn}/deployed.txt`).ok(() => true);
        assert.strictEqual(deployed.status, 200);
        assert.strictEqual(deployed.text, 'deployed\n');
  
        const hidden = await superagent.get(`https://${app.fqdn}/.well-known/ping.txt`).ok(() => true);
        assert.strictEqual(hidden.status, 200);
        assert.strictEqual(hidden.text, 'pong\n');
    });
    it('deploy removes previous files', async () => checkFileIsGone(SPECIAL_FOLDER_NAME_0));
    it('deploy is recorded', async function () {
        const res = await authed(superagent.get(`https://${app.fqdn}/api/deploys`));
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.some(function (entry) { return entry.username === gUsername; }));
    });
  
    it('uninstall app', cloudronCli.uninstall);
});
