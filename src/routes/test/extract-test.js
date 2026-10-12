import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as tar from 'tar';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Extract API', function () {
    const { setup, cleanup, url, filesDir } = common;

    before(setup);
    after(cleanup);

    it('rejects a request without a path', async function () {
        const response = await superagent.post(`${url()}/api/extract`).send({}).ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'missing path');
    });

    it('rejects a path outside the site', async function () {
        const response = await superagent.post(`${url()}/api/extract`)
            .send({ path: '/../../etc/passwd' })
            .ok(function () { return true; });

        assert.equal(response.status, 403);
        assert.equal(response.body.message, 'Path not allowed');
    });

    it('rejects an unsupported archive', async function () {
        fs.writeFileSync(path.join(filesDir(), 'notes.txt'), 'plain');

        const response = await superagent.post(`${url()}/api/extract`)
            .send({ path: '/notes.txt' })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
        assert.equal(response.body.message, 'unsupported archive format');
    });

    it('extracts a zip', async function () {
        fs.writeFileSync(path.join(filesDir(), 'bundle.zip'), storedZip('nested/page.txt', 'from-zip'));

        const response = await superagent.post(`${url()}/api/extract`).send({ path: '/bundle.zip' });

        assert.equal(response.status, 200);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'nested', 'page.txt'), 'utf8'), 'from-zip');
    });

    it('extracts a tar archive', async function () {
        const dir = fs.mkdtempSync(path.join(filesDir(), '..', 'tar-src-'));
        fs.writeFileSync(path.join(dir, 'page.txt'), 'from-tar');
        await tar.c({ gzip: true, cwd: dir, file: path.join(filesDir(), 'bundle.tar.gz') }, [ 'page.txt' ]);
        fs.rmSync(dir, { recursive: true, force: true });

        const response = await superagent.post(`${url()}/api/extract`).send({ path: '/bundle.tar.gz' });

        assert.equal(response.status, 200);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'page.txt'), 'utf8'), 'from-tar');
    });

    it('rejects a zip entry that escapes the destination', async function () {
        fs.writeFileSync(path.join(filesDir(), 'slip.zip'), storedZip('../escaped.txt', 'nope'));

        const response = await superagent.post(`${url()}/api/extract`)
            .send({ path: '/slip.zip' })
            .ok(function () { return true; });

        assert.equal(response.status, 500);
        assert.equal(response.body.message, 'invalid relative path: ../escaped.txt');
        assert.equal(fs.existsSync(path.join(filesDir(), '..', 'escaped.txt')), false);
    });
});

function storedZip(entryName, contents) {
    const data = Buffer.from(contents);
    const name = Buffer.from(entryName);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    name.copy(central, 46);

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(local.length + data.length, 16);

    return Buffer.concat([ local, data, central, end ]);
}
