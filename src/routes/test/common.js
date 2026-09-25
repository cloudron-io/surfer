import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverJs = path.resolve(import.meta.dirname, '../../../server.js');
const primaryDomain = 'app.example.com';
const aliasDomain = 'alpha.example.com';

let dataDir = '';
let child = null;
let serverUrl = '';

function setup() {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'surfer-route-'));
    const publicDir = path.join(dataDir, 'files');
    fs.mkdirSync(publicDir);

    const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SURFER_ENV: 'test',
        PORT: '0',
        CLOUDRON_APP_DOMAIN: primaryDomain,
        CLOUDRON_ALIAS_DOMAINS: aliasDomain,
    };

    child = spawn(process.execPath, [ serverJs, publicDir, path.join(dataDir, 'db.sqlite') ], {
        env,
        stdio: [ 'ignore', 'pipe', 'pipe' ],
    });

    let output = '';
    child.stdout.on('data', function (chunk) { output += chunk; });
    child.stderr.on('data', function (chunk) { output += chunk; });

    return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () {
            reject(new Error('server did not start\n' + output));
        }, 15000);

        child.on('exit', function (code) {
            clearTimeout(timer);
            reject(new Error('server exited ' + code + '\n' + output));
        });

        child.stdout.on('data', function () {
            const match = output.match(/Listening on (http:\/\/localhost:\d+)/);
            if (!match) return;
            clearTimeout(timer);
            child.removeAllListeners('exit');
            serverUrl = match[1];
            resolve();
        });
    });
}

function cleanup() {
    const dir = dataDir;
    const proc = child;
    dataDir = '';
    child = null;
    serverUrl = '';

    return new Promise(function (resolve) {
        if (!proc) {
            if (dir) fs.rmSync(dir, { recursive: true, force: true });
            resolve();
            return;
        }

        proc.once('exit', function () {
            if (dir) fs.rmSync(dir, { recursive: true, force: true });
            resolve();
        });
        proc.kill('SIGTERM');
    });
}

function url() {
    return serverUrl;
}

export default {
    setup,
    cleanup,
    url,
    primaryDomain,
    aliasDomain,
};
