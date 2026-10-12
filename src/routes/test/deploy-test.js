import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Deploy API', function () {
    const { setup, cleanup, url, filesDir, aliasDomain } = common;

    before(setup);
    after(cleanup);

    it('starts with an empty history', async function () {
        const response = await superagent.get(`${url()}/api/history`);
        assert.deepStrictEqual(response.body, []);
    });

    it('rejects a body that is not gzip', async function () {
        const response = await superagent.post(`${url()}/api/deploy`)
            .set('Content-Type', 'text/plain')
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'expected application/gzip');
    });

    it('rejects a bad deploy message', async function () {
        const response = await superagent.post(`${url()}/api/deploy`)
            .set('Content-Type', 'application/gzip')
            .set('Surfer-Message', '%')
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'invalid deploy message');
    });

    it('rejects an unknown deployment', async function () {
        const response = await superagent.post(`${url()}/api/deploy`)
            .set('Content-Type', 'application/gzip')
            .set('Surfer-Deployment', 'missing')
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'unknown deployment');
    });

    it('rejects an archive that is not gzip', async function () {
        const response = await postGzip(Buffer.from('not-gzip'));

        assert.equal(response.status, 500);
    });

    it('publishes an archive and records it', async function () {
        const response = await postGzip(await gzipOf('shipped.txt', 'shipped'), {
            'Surfer-Message': encodeURIComponent('ship it'),
        });

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'shipped.txt'), 'utf8'), 'shipped');

        const history = await superagent.get(`${url()}/api/history`);
        assert.equal(history.body[0].message, 'ship it');
        assert.equal(history.body[0].username, 'girish');
        assert.equal(history.body[0].name, 'Girish');
        assert.equal(history.body[0].site, 'default');
    });

    it('rejects promoting an unknown site', async function () {
        const response = await superagent.post(`${url()}/api/sites/nope/default`).ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'unknown site');
    });

    it('promotes a site onto the default site', async function () {
        const created = await superagent.post(`${url()}/api/sites`).send({ name: 'alpha', domain: aliasDomain });
        assert.equal(created.status, 201);
        fs.writeFileSync(path.join(filesDir(), '..', 'public-alpha', 'from-alpha.txt'), 'from-alpha');

        const response = await superagent.post(`${url()}/api/sites/alpha/default`);
        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'from-alpha.txt'), 'utf8'), 'from-alpha');

        const page = await superagent.get(`${url()}/from-alpha.txt`);
        assert.equal(page.text, 'from-alpha');

        const history = await superagent.get(`${url()}/api/history`);
        assert.equal(history.body[0].message, 'Deployed from alpha');
        assert.equal(history.body[0].site, 'default');
    });
});

async function gzipOf(filename, contents) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surfer-deploy-'));
    fs.writeFileSync(path.join(dir, filename), contents);
    const archive = path.join(dir, 'site.tar.gz');
    await tar.c({ gzip: true, cwd: dir, file: archive }, [ filename ]);
    const body = fs.readFileSync(archive);
    fs.rmSync(dir, { recursive: true, force: true });
    return body;
}

async function postGzip(body, headers) {
    const response = await fetch(`${common.url()}/api/deploy`, {
        method: 'POST',
        headers: Object.assign({
            'Content-Type': 'application/gzip',
            'Content-Length': String(body.length),
        }, headers),
        body,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
}
