import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import publicSite from '../publicSite.js';
import SurferError from '../surfererror.js';

describe('Public site', function () {
    let root = '';

    before(function () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'surfer-public-'));
        fs.writeFileSync(path.join(root, 'index.html'), '<p>home</p>');
        fs.mkdirSync(path.join(root, 'docs'));
        fs.writeFileSync(path.join(root, 'docs', 'a.txt'), 'page');
    });

    after(function () {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lists a directory', async function () {
        const result = await publicSite.listDirectory(root, 'docs');

        assert.equal(result.entries.length, 1);
        assert.equal(result.entries[0].fileName, 'a.txt');
        assert.equal(result.entries[0].isFile, true);
        assert.equal(result.entries[0].mimeType, 'text/plain');
        assert.equal(result.stat.isDirectory, true);
    });

    it('rejects a path outside the site', async function () {
        const [error] = await safe(publicSite.listDirectory(root, '../outside'));
        assert.equal(error.reason, SurferError.ACCESS_DENIED);
        assert.equal(error.message, 'Path not allowed');
    });

    it('rejects a missing directory', async function () {
        const [error] = await safe(publicSite.listDirectory(root, 'missing'));
        assert.equal(error.reason, SurferError.NOT_FOUND);
    });

    it('rejects a file', async function () {
        const [error] = await safe(publicSite.listDirectory(root, 'index.html'));
        assert.equal(error.reason, SurferError.INTERNAL_ERROR);
        assert.equal(error.message, 'unsupported type');
    });

    it('resolves zip sources inside the site', async function () {
        const paths = await publicSite.zipSources(root, [ '/index.html', 'docs/a.txt' ]);
        assert.deepStrictEqual(paths, [
            path.join(root, 'index.html'),
            path.join(root, 'docs', 'a.txt'),
        ]);
    });

    it('rejects a zip source outside the site', async function () {
        const [error] = await safe(publicSite.zipSources(root, [ '../outside' ]));
        assert.equal(error.reason, SurferError.ACCESS_DENIED);
        assert.equal(error.message, 'Path not allowed');
    });
});
