import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import common from './common.js';
import database from '../database.js';
import domains from '../domains.js';

describe('domains', function () {
    const { setup, cleanup, root } = common;

    before(setup);
    after(cleanup);

    it('maps the primary domain to public', function () {
        domains.init(root(), 'old.example.com', []);

        assert.deepStrictEqual(domains.list(), [{ domain: 'old.example.com', publicDir: 'public' }]);
    });

    it('follows a location change onto the existing public directory', function () {
        domains.init(root(), 'new.example.com', []);

        assert.deepStrictEqual(domains.list(), [{ domain: 'new.example.com', publicDir: 'public' }]);
    });

    it('rejects a second row for the public directory', function () {
        assert.throws(function () { domains.insert('other.example.com', 'public'); }, /UNIQUE constraint failed/);
        assert.equal(domains.rowForDomain('other.example.com'), null);
    });

    it('adds a sites row for an existing alias directory', function () {
        fs.mkdirSync(path.join(root(), 'public-alpha.example.com'));
        domains.init(root(), 'new.example.com', [ 'alpha.example.com' ]);

        assert.deepStrictEqual(domains.rowForDomain('alpha.example.com'), {
            domain: 'alpha.example.com',
            publicDir: 'public-alpha.example.com',
        });
    });

    it('removes a site row', function () {
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
