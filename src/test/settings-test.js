import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import common from './common.js';
import settings from '../settings.js';

describe('Settings', function () {
    const { setup, cleanup, root, dbFile } = common;
    let faviconFile = '';
    let faviconFallback = '';

    before(async function () {
        setup();
        faviconFile = path.join(root(), 'favicon.png');
        faviconFallback = path.join(root(), 'logo.png');
        fs.writeFileSync(path.join(root(), '.surfer.json'), JSON.stringify({
            title: 'Legacy title',
            folderListingEnabled: 'true',
            index: 'home.html',
        }));
        fs.writeFileSync(faviconFallback, 'fallback');
        await settings.init(dbFile(), { faviconFile, faviconFallback });
        settings.load();
    });

    after(cleanup);

    it('migrates legacy settings', function () {
        const config = settings.current();
        assert.equal(config.title, 'Legacy title');
        assert.equal(config.folderListingEnabled, true);
        assert.equal(config.index, 'home.html');
        assert.equal(fs.existsSync(path.join(root(), '.surfer.json')), false);
    });

    it('saves an update', async function () {
        await settings.update({
            folderListingEnabled: false,
            title: 'Renamed',
            index: '',
            accessRestriction: 'user',
            passwordUpdate: { accessPassword: 'hashed', accessPasswordSalt: 'salt' },
        });

        const config = settings.load();
        assert.equal(config.title, 'Renamed');
        assert.equal(config.folderListingEnabled, false);
        assert.equal(config.accessRestriction, 'user');
        assert.equal(config.accessPassword, 'hashed');
        assert.equal(config.accessPasswordSalt, 'salt');
    });

    it('keeps the stored password when an update omits one', async function () {
        await settings.update({
            folderListingEnabled: false,
            title: 'Renamed',
            index: '',
            accessRestriction: 'user',
        });

        assert.equal(settings.current().accessPassword, 'hashed');
    });

    it('writes and resets the favicon', async function () {
        const upload = path.join(root(), 'upload.png');
        fs.writeFileSync(upload, 'custom');

        await settings.writeFavicon(upload);
        assert.equal(fs.readFileSync(faviconFile, 'utf8'), 'custom');
        assert.equal(settings.faviconPath(), faviconFile);

        await settings.removeFavicon();
        assert.equal(fs.existsSync(faviconFile), false);
        assert.equal(settings.faviconPath(), faviconFallback);
    });
});
