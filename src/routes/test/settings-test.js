import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Settings API', function () {
    const { setup, cleanup, url, faviconPath } = common;

    before(setup);
    after(cleanup);

    it('returns the signed-in profile', async function () {
        const response = await superagent.get(`${url()}/api/profile`);

        assert.equal(response.status, 200);
        assert.deepStrictEqual(response.body, { username: 'girish', name: 'Girish' });
    });

    it('returns the default settings', async function () {
        const response = await superagent.get(`${url()}/api/settings`);

        assert.equal(response.status, 200);
        assert.equal(response.body.title, 'Surfer');
        assert.equal(response.body.folderListingEnabled, false);
        assert.equal(response.body.accessRestriction, '');
        assert.equal(response.body.accessPassword, '');
    });

    it('rejects a settings update without a title', async function () {
        const response = await superagent.put(`${url()}/api/settings`)
            .send({ folderListingEnabled: false })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'missing title string');
    });

    it('rejects login while the site is open', async function () {
        const response = await superagent.post(`${url()}/api/protectedLogin`)
            .send({ password: 'secret' })
            .ok(function () { return true; });

        assert.equal(response.status, 409);
        assert.equal(response.body.message, 'site is not protected');
    });

    it('rejects login without a password', async function () {
        const response = await superagent.post(`${url()}/api/protectedLogin`).send({}).ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'missing password');
    });

    it('stores a password and hides the hash', async function () {
        const response = await superagent.put(`${url()}/api/settings`).send({
            folderListingEnabled: false,
            title: 'Locked',
            index: '',
            accessRestriction: 'password',
            accessPassword: 'secret',
        });

        assert.equal(response.status, 201);

        const settings = await superagent.get(`${url()}/api/settings`);
        assert.equal(settings.body.title, 'Locked');
        assert.equal(settings.body.accessRestriction, 'password');
        assert.equal(settings.body.accessPassword, '__PLACEHOLDER__');
    });

    it('rejects the wrong password', async function () {
        const response = await superagent.post(`${url()}/api/protectedLogin`)
            .send({ password: 'nope' })
            .ok(function () { return true; });

        assert.equal(response.status, 403);
        assert.equal(response.body.message, 'forbidden');
    });

    it('sets a cookie for the right password', async function () {
        const response = await superagent.post(`${url()}/api/protectedLogin`).send({ password: 'secret' });

        assert.equal(response.status, 200);
        const cookies = response.headers['set-cookie'];
        assert.ok(cookies.some(function (cookie) { return cookie.startsWith('surfer.auth='); }));
    });

    it('keeps the password when the placeholder is sent back', async function () {
        const response = await superagent.put(`${url()}/api/settings`).send({
            folderListingEnabled: true,
            title: 'Locked',
            index: '',
            accessRestriction: 'password',
            accessPassword: '__PLACEHOLDER__',
        });

        assert.equal(response.status, 201);

        const login = await superagent.post(`${url()}/api/protectedLogin`).send({ password: 'secret' });
        assert.equal(login.status, 200);
    });

    it('replaces the favicon', async function () {
        const icon = faviconPath();
        const response = await superagent.put(`${url()}/api/favicon`).attach('file', Buffer.from('png-bytes'));

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(icon, 'utf8'), 'png-bytes');

        const downloaded = await superagent.get(`${url()}/api/favicon`);
        assert.equal(downloaded.status, 200);
        assert.equal(Buffer.compare(downloaded.body, Buffer.from('png-bytes')), 0);

        const removed = await superagent.del(`${url()}/api/favicon`);
        assert.equal(removed.status, 201);
        assert.equal(fs.existsSync(icon), false);
    });
});
