import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import superagent from '@cloudron/superagent';
import common from './common.js';

describe('Files API', function () {
    const { setup, cleanup, url, filesDir, aliasDomain } = common;

    before(setup);
    after(cleanup);

    it('creates an alias site', async function () {
        const response = await superagent.post(`${url()}/api/sites`)
            .send({ name: 'alpha', domain: aliasDomain });

        assert.equal(response.status, 201);
    });

    it('copies a file onto another site', async function () {
        fs.writeFileSync(path.join(filesDir(), 'note.txt'), 'from-default');

        const response = await superagent.post(`${url()}/api/copy`)
            .query({ deployment: 'alpha' })
            .send({ sources: [ '/note.txt' ], destination: '/', sourceDeployment: 'default' });

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), 'note.txt'), 'utf8'), 'from-default');
        assert.equal(fs.readFileSync(path.join(filesDir(), '..', 'public-alpha', 'note.txt'), 'utf8'), 'from-default');
    });

    it('copies a directory onto another site', async function () {
        fs.mkdirSync(path.join(filesDir(), 'docs'));
        fs.writeFileSync(path.join(filesDir(), 'docs', 'a.txt'), 'page');

        const response = await superagent.post(`${url()}/api/copy`)
            .query({ deployment: 'alpha' })
            .send({ sources: [ '/docs' ], destination: '/', sourceDeployment: 'default' });

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), '..', 'public-alpha', 'docs', 'a.txt'), 'utf8'), 'page');
        assert.equal(fs.readFileSync(path.join(filesDir(), 'docs', 'a.txt'), 'utf8'), 'page');
    });

    it('moves a file onto another site with the same relative path', async function () {
        fs.writeFileSync(path.join(filesDir(), 'moved.txt'), 'cut');

        const response = await superagent.put(`${url()}/api/files/moved.txt`)
            .query({ deployment: 'alpha' })
            .send({ newFilePath: '/moved.txt', overwrite: 'rename', sourceDeployment: 'default' });

        assert.equal(response.status, 200);
        assert.equal(fs.existsSync(path.join(filesDir(), 'moved.txt')), false);
        assert.equal(fs.readFileSync(path.join(filesDir(), '..', 'public-alpha', 'moved.txt'), 'utf8'), 'cut');
    });

    it('copies within one site when sourceDeployment is omitted', async function () {
        const response = await superagent.post(`${url()}/api/copy`)
            .query({ deployment: 'alpha' })
            .send({ sources: [ '/note.txt' ], destination: '/' });

        assert.equal(response.status, 201);
        assert.equal(fs.readFileSync(path.join(filesDir(), '..', 'public-alpha', 'note (1).txt'), 'utf8'), 'from-default');
    });

    it('rejects an unknown source site', async function () {
        const response = await superagent.post(`${url()}/api/copy`)
            .query({ deployment: 'alpha' })
            .send({ sources: [ '/note.txt' ], destination: '/', sourceDeployment: 'missing' })
            .ok(function () { return true; });

        assert.equal(response.status, 400);
    });

    it('rejects a source path outside the site', async function () {
        const response = await superagent.post(`${url()}/api/copy`)
            .query({ deployment: 'alpha' })
            .send({ sources: [ '/../../etc/passwd' ], destination: '/', sourceDeployment: 'default' })
            .ok(function () { return true; });

        assert.equal(response.status, 403);
    });
});
