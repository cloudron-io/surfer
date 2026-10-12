import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Public files', function () {
    const { setup, cleanup, url, filesDir } = common;

    before(setup);
    after(cleanup);

    it('serves index.xml for a folder without index.html', async function () {
        fs.mkdirSync(path.join(filesDir(), 'rss'));
        fs.writeFileSync(path.join(filesDir(), 'rss', 'index.xml'), '<rss version="2.0"></rss>');

        const response = await superagent.get(`${url()}/rss/`);
        assert.equal(response.status, 200);
        assert.match(response.headers['content-type'], /xml/);
        assert.match(response.headers['cache-control'], /max-age=0/);
        assert.equal(response.body.toString(), '<rss version="2.0"></rss>');
    });

    it('prefers index.html over index.xml', async function () {
        fs.writeFileSync(path.join(filesDir(), 'rss', 'index.html'), '<p>html</p>');

        const response = await superagent.get(`${url()}/rss/`);
        assert.equal(response.status, 200);
        assert.match(response.headers['content-type'], /text\/html/);
        assert.equal(response.text, '<p>html</p>');
    });

    it('revalidates xml files', async function () {
        fs.writeFileSync(path.join(filesDir(), 'rss.xml'), '<rss version="2.0"></rss>');
        fs.writeFileSync(path.join(filesDir(), 'style.css'), 'body {}');

        const xml = await superagent.get(`${url()}/rss.xml`);
        assert.match(xml.headers['cache-control'], /max-age=0/);

        const css = await superagent.get(`${url()}/style.css`);
        assert.match(css.headers['cache-control'], /max-age=3600/);
    });

    it('serves a known file when folder listing is off', async function () {
        fs.mkdirSync(path.join(filesDir(), 'unguessable'));
        fs.writeFileSync(path.join(filesDir(), 'unguessable', 'index.html'), 'secret-page');

        const response = await superagent.get(`${url()}/unguessable/index.html`);
        assert.equal(response.status, 200);
        assert.equal(response.text, 'secret-page');
    });

    it('refuses an anonymous zip when folder listing is off', async function () {
        const response = await anonymousZip([ '/' ]);
        assert.equal(response.status, 401);
        assert.ok(!String(response.headers['content-type'] || '').includes('zip'));
    });

    it('zips for a signed-in admin when folder listing is off', async function () {
        const response = await superagent.get(`${url()}/api/zip`).query({ paths: JSON.stringify([ '/' ]) });
        assertZipContains(response, 'unguessable');
    });

    it('allows an anonymous zip of this site when folder listing is on', async function () {
        await superagent.put(`${url()}/api/settings`)
            .send({ folderListingEnabled: true, title: 'Surfer', index: '', accessRestriction: '' });

        const response = await anonymousZip([ '/unguessable' ]);
        assertZipContains(response, 'index.html');
    });

    it('refuses an anonymous zip of another deployment', async function () {
        fs.mkdirSync(path.join(filesDir(), '..', 'public-alpha'));
        fs.writeFileSync(path.join(filesDir(), '..', 'public-alpha', 'other.txt'), 'other-site');

        const response = await anonymousZip([ '/' ], 'alpha');
        assert.equal(response.status, 401);
        assert.ok(!response.body.includes(Buffer.from('other-site')));
    });

    it('zips another deployment for a signed-in admin', async function () {
        const response = await superagent.get(`${url()}/api/zip`)
            .query({ paths: JSON.stringify([ '/' ]), deployment: 'alpha' });
        assertZipContains(response, 'other.txt');
    });

    function anonymousZip(paths, deployment) {
        const query = { paths: JSON.stringify(paths) };
        if (deployment) query.deployment = deployment;

        return superagent.get(`${url()}/api/zip`)
            .query(query)
            .auth('nobody', 'nope')
            .ok(function () { return true; });
    }

    function assertZipContains(response, name) {
        assert.equal(response.status, 200);
        assert.match(response.headers['content-type'], /zip/);
        assert.ok(response.body.includes(Buffer.from(name)));
    }
});
