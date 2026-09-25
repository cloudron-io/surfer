import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Sites API', function () {
    const { setup, cleanup, url, primaryDomain, aliasDomain } = common;

    before(setup);
    after(cleanup);

    it('lists the primary site', async function () {
        const response = await superagent.get(`${url()}/api/sites`).ok(function () { return true; });

        assert.equal(response.status, 200);
        assert.ok(response.body.some(function (entry) {
            return entry.domain === primaryDomain && entry.publicDir === 'public' && entry.name === 'default';
        }));
    });

    it('rejects basic auth that is not an app password', async function () {
        const response = await superagent.get(`${url()}/api/sites`)
            .auth('girish', 'nope')
            .ok(function () { return true; });

        assert.equal(response.status, 401);
    });

    it('rejects a site on the primary domain', async function () {
        const response = await superagent.post(`${url()}/api/sites`)
            .send({ name: 'alpha', domain: primaryDomain })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'domain must be an alias');
    });

    it('rejects the default name', async function () {
        const response = await superagent.post(`${url()}/api/sites`)
            .send({ name: 'default', domain: aliasDomain })
            .ok(function () { return true; });

        assert.equal(response.status, 409);
    });

    it('creates a site on a free alias', async function () {
        const response = await superagent.post(`${url()}/api/sites`)
            .send({ name: 'alpha', domain: aliasDomain });

        assert.equal(response.status, 201);
        assert.deepStrictEqual(response.body, { name: 'alpha', publicDir: 'public-alpha', domain: aliasDomain });
    });

    it('rejects editing the default site', async function () {
        const response = await superagent.put(`${url()}/api/sites/${encodeURIComponent(primaryDomain)}`)
            .send({ name: 'alpha', domain: aliasDomain })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
    });

    it('rejects editing an unknown site', async function () {
        const response = await superagent.put(`${url()}/api/sites/missing.example.com`)
            .send({ name: 'beta', domain: 'beta.example.com' })
            .ok(function () { return true; });

        assert.equal(response.status, 404);
    });

    it('rejects deploying the default site onto itself', async function () {
        const response = await superagent.post(`${url()}/api/sites/default/default`).ok(function () { return true; });
        assert.equal(response.status, 400);
    });

    it('rejects removing the default site', async function () {
        const response = await superagent.del(`${url()}/api/sites/${encodeURIComponent(primaryDomain)}`).ok(function () { return true; });
        assert.equal(response.status, 400);
    });

    it('rejects removing an unknown site', async function () {
        const response = await superagent.del(`${url()}/api/sites/missing.example.com`).ok(function () { return true; });
        assert.equal(response.status, 404);
    });

    it('removes a site', async function () {
        const response = await superagent.del(`${url()}/api/sites/${encodeURIComponent(aliasDomain)}`);
        assert.equal(response.status, 200);

        const list = await superagent.get(`${url()}/api/sites`);
        assert.ok(!list.body.some(function (entry) { return entry.domain === aliasDomain; }));
    });
});
