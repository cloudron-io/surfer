import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import access from '../access.js';
import common from './common.js';
import settings from '../settings.js';
import SurferError from '../surfererror.js';

describe('Access', function () {
    const { setup, cleanup, root, dbFile } = common;

    before(async function () {
        setup();
        await settings.init(dbFile(), {
            faviconFile: path.join(root(), 'favicon.png'),
            faviconFallback: path.join(root(), 'logo.png'),
        });
        settings.load();
    });

    after(cleanup);

    it('rejects login when the site is not password protected', async function () {
        const [error] = await safe(access.login('secret'));
        assert.equal(error.reason, SurferError.NOT_PROTECTED);
        assert.equal(error.message, 'site is not protected');
    });

    it('accepts the right password and rejects the wrong one', async function () {
        const hashed = await access.hashPassword('secret');
        await settings.update({
            folderListingEnabled: false,
            title: 'Surfer',
            index: '',
            accessRestriction: 'password',
            passwordUpdate: hashed,
        });

        const [error] = await safe(access.login('nope'));
        assert.equal(error.reason, SurferError.ACCESS_DENIED);
        assert.equal(error.message, 'forbidden');

        const token = await access.login('secret');
        assert.equal(typeof token, 'string');
        assert.equal(access.cookieMatches(`${access.PASSWORD_COOKIE}=${token}`), true);
        assert.equal(access.cookieMatches('other=1'), false);
        assert.equal(access.cookieMatches(`${access.PASSWORD_COOKIE}=00`), false);
    });
});
