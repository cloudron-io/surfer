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

    it('maps the primary domain to public', function () {
        domains.init('old.example.com');

        assert.deepStrictEqual(domains.list(), [{ domain: 'old.example.com', publicDir: 'public' }]);
    });

    it('follows a location change onto the existing public directory', function () {
        domains.init('new.example.com');

        assert.deepStrictEqual(domains.list(), [{ domain: 'new.example.com', publicDir: 'public' }]);
    });

    it('rejects a second row for the public directory', function () {
        assert.throws(function () { domains.insert('other.example.com', 'public'); }, /UNIQUE constraint failed/);
        assert.equal(domains.rowForDomain('other.example.com'), null);
    });

    it('does not map an alias directory that has no site', function () {
        fs.mkdirSync(path.join(root(), 'public-alpha.example.com'));
        domains.init('new.example.com');

        assert.equal(domains.rowForDomain('alpha.example.com'), null);
    });

    it('serves Default for an alias with no site', function () {
        const resolved = sites.resolveRequest({ headers: { host: 'alpha.example.com' } });
        assert.equal(resolved.root, sites.primaryRoot);
    });

    it('serves the mapped directory for an alias site', function () {
        domains.insert('alpha.example.com', 'public-alpha');

        const resolved = sites.resolveRequest({ headers: { host: 'alpha.example.com' } });
        assert.equal(resolved.root, path.resolve(sites.dataDir, 'public-alpha'));

        domains.remove('alpha.example.com');
    });

    it('removes a site row', function () {
        domains.insert('alpha.example.com', 'public-alpha');
        domains.remove('alpha.example.com');
        assert.equal(domains.rowForDomain('alpha.example.com'), null);
        assert.ok(domains.rowForDomain('new.example.com'));
    });

    it('keeps a unique index on publicDir', function () {
        const index = database.get(`SELECT sql FROM sqlite_master WHERE name = 'sites_publicDir'`);
        assert.ok(index);
        assert.match(index.sql, /UNIQUE/);
    });
});
