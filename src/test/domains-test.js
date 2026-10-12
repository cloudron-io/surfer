import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import common from './common.js';
import database from '../database.js';
import domains from '../domains.js';
import sites from '../sites.js';

describe('domains', function () {
    const { setup, cleanup, root } = common;

    before(setup);
    after(cleanup);

    it('maps the primary domain to public', async function () {
        domains.init('old.example.com');

        assert.deepStrictEqual(await domains.list(), [{ domain: 'old.example.com', publicDir: 'public' }]);
    });

    it('follows a location change onto the existing public directory', async function () {
        domains.init('new.example.com');

        assert.deepStrictEqual(await domains.list(), [{ domain: 'new.example.com', publicDir: 'public' }]);
    });

    it('rejects a second row for the public directory', async function () {
        await assert.rejects(domains.insert('other.example.com', 'public'), /UNIQUE constraint failed/);
        assert.equal(await domains.rowForDomain('other.example.com'), null);
    });

    it('does not map an alias directory that has no site', async function () {
        fs.mkdirSync(path.join(root(), 'public-alpha.example.com'));
        domains.init('new.example.com');

        assert.equal(await domains.rowForDomain('alpha.example.com'), null);
    });

    it('serves Default for an alias with no site', function () {
        process.env.CLOUDRON_APP_DOMAIN = 'app.example.com';
        process.env.CLOUDRON_ALIAS_DOMAINS = 'alpha.example.com';
        try {
            const resolved = sites.resolveRequest({ headers: { host: 'alpha.example.com' } });
            assert.equal(resolved.root, sites.primaryRoot);
        } finally {
            delete process.env.CLOUDRON_APP_DOMAIN;
            delete process.env.CLOUDRON_ALIAS_DOMAINS;
        }
    });

    it('serves the mapped directory for an alias site', async function () {
        process.env.CLOUDRON_APP_DOMAIN = 'app.example.com';
        process.env.CLOUDRON_ALIAS_DOMAINS = 'alpha.example.com';
        await domains.insert('alpha.example.com', 'public-alpha');
        try {
            const resolved = sites.resolveRequest({ headers: { host: 'alpha.example.com' } });
            assert.equal(resolved.root, path.resolve(sites.dataDir, 'public-alpha'));
        } finally {
            await domains.remove('alpha.example.com');
            delete process.env.CLOUDRON_APP_DOMAIN;
            delete process.env.CLOUDRON_ALIAS_DOMAINS;
        }
    });

    it('removes a site row', async function () {
        await domains.insert('alpha.example.com', 'public-alpha');
        await domains.remove('alpha.example.com');
        assert.equal(await domains.rowForDomain('alpha.example.com'), null);
        assert.ok(await domains.rowForDomain('new.example.com'));
    });

    it('keeps a unique index on publicDir', function () {
        const index = database.get(`SELECT sql FROM sqlite_master WHERE name = 'sites_publicDir'`);
        assert.ok(index);
        assert.match(index.sql, /UNIQUE/);
    });
});
