import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import safe from '@cloudron/safetydance';
import common from './common.js';
import history from '../history.js';
import SurferError from '../surfererror.js';

describe('History', function () {
    const { setup, cleanup } = common;

    before(function () {
        setup();
        history.init();
    });

    after(cleanup);

    it('treats an empty message as blank', async function () {
        assert.equal(await history.parseMessage(null), '');
        assert.equal(await history.parseMessage(''), '');
    });

    it('decodes and trims a message', async function () {
        assert.equal(await history.parseMessage(encodeURIComponent('  ship it  ')), 'ship it');
    });

    it('rejects a message that is not a string', async function () {
        const [error] = await safe(history.parseMessage(12));
        assert.equal(error.reason, SurferError.BAD_FIELD);
        assert.equal(error.message, 'invalid deploy message');
    });

    it('rejects a message that is not encoded', async function () {
        const [error] = await safe(history.parseMessage('%'));
        assert.equal(error.reason, SurferError.BAD_FIELD);
        assert.equal(error.message, 'invalid deploy message');
    });

    it('rejects a message that is too long', async function () {
        const [error] = await safe(history.parseMessage('x'.repeat(1001)));
        assert.equal(error.reason, SurferError.BAD_FIELD);
        assert.equal(error.message, 'deploy message is too long');
    });

    it('records a deploy and drops entries past the limit', async function () {
        for (let i = 0; i < 51; i++) await history.add({ username: 'ada', name: 'Ada' }, `note-${i}`, i === 0 ? '' : 'alpha');

        const rows = await history.list();
        assert.equal(rows.length, 50);
        assert.equal(rows[0].message, 'note-50');
        assert.equal(rows[0].username, 'ada');
        assert.equal(rows[0].name, 'Ada');
        assert.equal(rows[0].site, 'alpha');
        assert.equal(rows[49].message, 'note-1');
        assert.ok(!rows.some(function (row) { return row.message === 'note-0'; }));
    });
});
