import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Site update API', function () {
    const { setup, cleanup, url, filesDir, aliasDomain } = common;

    before(setup);
    after(cleanup);

    it('renames a site and keeps its files on the same domain', async function () {
        const created = await superagent.post(`${url()}/api/sites`).send({ name: 'alpha', domain: aliasDomain });
        assert.equal(created.status, 201);

        const siteDir = path.join(filesDir(), '..', 'public-alpha');
        fs.writeFileSync(path.join(siteDir, 'marker.txt'), 'alpha-page');

        const updated = await superagent.put(`${url()}/api/sites/${encodeURIComponent(aliasDomain)}`)
            .send({ name: 'beta', domain: aliasDomain });

        assert.equal(updated.status, 200);
        assert.deepStrictEqual(updated.body, { name: 'beta', publicDir: 'public-beta', domain: aliasDomain });
        assert.equal(fs.existsSync(siteDir), false);
        assert.equal(fs.readFileSync(path.join(filesDir(), '..', 'public-beta', 'marker.txt'), 'utf8'), 'alpha-page');

        const page = await superagent.get(`${url()}/marker.txt`).set('Host', aliasDomain);
        assert.equal(page.status, 200);
        assert.equal(page.text, 'alpha-page');
    });
});
