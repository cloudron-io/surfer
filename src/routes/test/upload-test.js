import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('File upload API', function () {
    const { setup, cleanup, url, filesDir } = common;

    before(setup);
    after(cleanup);

    it('rejects a post with neither a file nor a directory', async function () {
        const response = await superagent.post(`${url()}/api/files/hello.txt`)
            .send({})
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'missing file or directory');
    });

    it('rejects a post that sets both a file and a directory', async function () {
        const response = await superagent.post(`${url()}/api/files/hello.txt`)
            .query({ directory: 'true' })
            .attach('file', Buffer.from('hello'))
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'either file or directory');
    });

    it('creates a directory', async function () {
        const response = await superagent.post(`${url()}/api/files/docs`).query({ directory: 'true' });

        assert.equal(response.status, 201);
        assert.equal(fs.statSync(path.join(filesDir(), 'docs')).isDirectory(), true);
    });

    it('rejects posting a file onto a directory', async function () {
        const response = await superagent.post(`${url()}/api/files/docs`)
            .attach('file', Buffer.from('hello'))
            .ok(function () { return true; });

        assert.equal(response.status, 409);
        assert.equal(response.body.message, 'cannot post on directories');
    });

    it('uploads a file', async function () {
        const response = await superagent.post(`${url()}/api/files/hello.txt`).attach('file', Buffer.from('hello'));

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'hello.txt'), 'utf8'), 'hello');
    });

    it('lists a directory', async function () {
        const response = await superagent.get(`${url()}/api/files/docs`);

        assert.equal(response.status, 222);
        assert.equal(response.body.stat.isDirectory, true);
        assert.deepStrictEqual(response.body.entries, []);
    });

    it('downloads a file', async function () {
        const response = await superagent.get(`${url()}/api/files/hello.txt`);

        assert.equal(response.status, 200);
        assert.equal(response.text, 'hello');
    });

    it('rejects a path outside the site', async function () {
        const response = await superagent.get(`${url()}/api/files/${encodeURIComponent('../outside.txt')}`)
            .ok(function () { return true; });

        assert.equal(response.status, 403);
        assert.equal(response.body.message, 'Path not allowed');
    });

    it('reports a delete outside the site as missing', async function () {
        const response = await superagent.del(`${url()}/api/files/${encodeURIComponent('../outside.txt')}`)
            .ok(function () { return true; });

        assert.equal(response.status, 404);
        assert.equal(response.body.message, 'Not found');
    });

    it('refuses to write under _admin', async function () {
        const response = await superagent.post(`${url()}/api/files/_admin/secret.txt`)
            .attach('file', Buffer.from('secret'))
            .ok(function () { return true; });

        assert.equal(response.status, 403);
        assert.equal(response.body.message, 'Path not allowed');
        assert.equal(fs.existsSync(path.join(filesDir(), '_admin', 'secret.txt')), false);
    });

    it('refuses to overwrite an existing file', async function () {
        fs.writeFileSync(path.join(filesDir(), 'dest.txt'), 'keep');

        const response = await superagent.put(`${url()}/api/files/hello.txt`)
            .send({ newFilePath: '/dest.txt', overwrite: false })
            .ok(function () { return true; });

        assert.equal(response.status, 409);
        assert.equal(response.body.message, 'destination exists');
        assert.equal(fs.readFileSync(path.join(filesDir(), 'hello.txt'), 'utf8'), 'hello');
        assert.equal(fs.readFileSync(path.join(filesDir(), 'dest.txt'), 'utf8'), 'keep');
    });

    it('picks a new name when overwrite is rename', async function () {
        const response = await superagent.put(`${url()}/api/files/hello.txt`)
            .send({ newFilePath: '/dest.txt', overwrite: 'rename' });

        assert.equal(response.status, 200);
        assert.equal(fs.existsSync(path.join(filesDir(), 'hello.txt')), false);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'dest.txt'), 'utf8'), 'keep');
        assert.equal(fs.readFileSync(path.join(filesDir(), 'dest (1).txt'), 'utf8'), 'hello');
    });

    it('refuses to delete a directory without recursive', async function () {
        const response = await superagent.del(`${url()}/api/files/docs`).ok(function () { return true; });

        assert.equal(response.status, 403);
        assert.equal(response.body.message, 'Is directory');
        assert.equal(fs.existsSync(path.join(filesDir(), 'docs')), true);
    });

    it('deletes a directory recursively', async function () {
        const response = await superagent.del(`${url()}/api/files/docs`).query({ recursive: 'true' });

        assert.equal(response.status, 200);
        assert.equal(fs.existsSync(path.join(filesDir(), 'docs')), false);
    });

    it('rejects a zip without paths', async function () {
        const response = await superagent.get(`${url()}/api/zip`).ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'missing paths');
    });

    it('rejects a zip with invalid paths', async function () {
        const response = await superagent.get(`${url()}/api/zip`)
            .query({ paths: 'not-json' })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'invalid paths');
    });
});
