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
});
