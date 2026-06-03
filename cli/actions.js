'use strict';

import superagent from '@cloudron/superagent';
import config from './config.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import safe from '@cloudron/safetydance';
import async from 'async';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
const API = '/api/files/';

let gServer = '';
let gQuery = {};

function exit(error) {
    if (error instanceof Error) console.log(error.message);
    else if (error) console.log(error);

    process.exit(error ? 1 : 0);
}

function requestError(response) {
    if (response.status === 401) return 'Invalid token';

    return `${response.status} message: ${response.body.message || JSON.stringify(String(response.body))}`; // body is sometimes just a string like in 401
}

function checkConfig(options) {
    if ((!options.server && !config.server()) || (!options.token && !config.accessToken())) exit(`Run surfer config first, or provide --server <domain> --token <access token>`);

    if (options.server) {
        let tmp;
        try {
            tmp = new URL(options.server);
        } catch {
            tmp = new URL('https://' + options.server);
        }
        gServer = `${tmp.protocol}//${tmp.host}`;
    } else {
        gServer = config.server();
    }

    gQuery = { access_token: options.token || config.accessToken() };

    console.error(`Using server ${gServer}`);
}

function collectFiles(filePath, basePath, options) {
    let tmp = [];

    const absoluteFilePath = path.resolve(basePath, filePath);

    const fileName = path.basename(absoluteFilePath);
    if (!options.all && fileName[0] === '.' && fileName.length > 1) return [];

    const stat = fs.statSync(absoluteFilePath);

    const file = {
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        atime: stat.atime.toISOString(),
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        birthtime: stat.birthtime,
        size: stat.size,
        fileName: fileName,
        filePath: absoluteFilePath.slice(basePath.length), // this is relative to basePath
        absoluteFilePath: absoluteFilePath
    };

    if (stat.isFile()) {
        tmp.push(file);
    } else if (stat.isDirectory()) {
        tmp.push(file);

        fs.readdirSync(absoluteFilePath).forEach(function (fileName) {
            tmp = tmp.concat(collectFiles(path.join(absoluteFilePath, fileName), basePath, options));
        });
    } else {
        console.log(`Skipping ${filePath}`);
    }

    return tmp;
}

async function putOne(file, destination) {
    const destinationPath = path.join(destination, file.filePath);

    if (file.isFile) {
        console.log(`Uploading ${file.filePath} -> ${gServer + destinationPath}`);

        const response = await superagent.post(`${gServer}${API}${encodeURIComponent(destinationPath)}`)
            .query(gQuery)
            .attach('file', file.absoluteFilePath)
            .field('mtime', file.mtime)
            .ok(() => true);

        if (response.status === 403) throw new Error(`Destination ${destinationPath} not allowed`);
        if (response.status !== 201) new Error(`Error uploading file. ${requestError(response)}`);
    } else if (file.isDirectory) {
        console.log(`Creating directory ${destinationPath}`);

        const query = safe.JSON.parse(safe.JSON.stringify(gQuery));
        query.directory = true;

        const response = await superagent.post(`${gServer}${API}${encodeURIComponent(destinationPath)}`).query(query).ok(() => true);
        if (response.status === 409) return; // already exists, fine
        if (response.status === 403) throw new Error(`Destination ${destinationPath} not allowed`);
        if (response.status !== 201) new Error(`Error creating directory. ${requestError(response)}`);
    } else {
        console.log(`Ignoring unknown file type: ${JSON.stringify(file)}`);
    }
}

async function delOne(file) {
    const query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    if (file.isDirectory) query.recursive = true;

    const [error, response] = await safe(superagent.del(`${gServer}${API}${encodeURIComponent(file.filePath)}`).query(query).ok(() => true));
    if (error) return exit(error);
    if (response.status === 404) return; // file already removed
    if (response.status === 403) throw new Error('Failed. Target is a directory. Use --recursive to delete directories.');
    if (response.status !== 200) throw new Error(requestError(response));
}

async function configure(options) {
    checkConfig(options);

    const [error, response] = await safe(superagent.get(`${gServer}/api/profile`).query(gQuery).ok(() => true));
    if (error) return exit(`Failed to connect to server: ${error}`);
    if (response.status !== 200) return exit(`Access failed: ${response.status}. Provide an api access token with --token`);

    config.set('server', gServer);
    config.set('accessToken', gQuery.access_token);

    console.log('Default server successfully set');
}

async function get(filePath, options) {
    checkConfig(options);

    // if no argument provided, fetch root
    filePath = filePath || '/';

    const url = new URL(gServer + path.join(API, encodeURIComponent(filePath)));
    url.search = new URLSearchParams(gQuery).toString();

    const [error, response] = await safe(fetch(url, {}));
    if (error) return exit(error);
    if (response.status === 401) return exit('Invalid token');
    if (response.status === 404) return exit(`No such file or directory ${filePath}`);

    // 222 indicates directory listing
    if (response.status === 222) {
        const files = await response.json();
        if (!files || files.entries.length === 0) {
            console.log(`Empty directory.`);
        } else {
            console.log('Entries:');
            files.entries.forEach(function (entry) {
                console.log(`\t ${entry.isDirectory ? entry.filePath + '/' : entry.filePath}`);
            });
        }
    } else {
        Readable.fromWeb(response.body).pipe(process.stdout);
    }
}

async function del(filePath, options) {
    checkConfig(options);

    // construct a virtual file for further use
    const file = {
        filePath: filePath,
        isDirectory: !!options.recursive
    };

    if (filePath === '/') {
        if (!options.recursive) exit('To delete all files --recursive is required.');
        if (!options.yes) {
            const rl = readline.createInterface({ input, output });
            try {
                const answer = await rl.question('Really delete all files? [y/N] ');
                if (!/^y(es)?$/i.test(answer.trim())) exit();
            } finally {
                rl.close();
            }
        }
    }

    const [error] = await safe(delOne(file));
    if (error) return exit(error);
    console.log('Success.');
}

async function put(filePaths, options) {
    checkConfig(options);

    if (filePaths.length < 2) {
        console.log('Target directory argument is missing. Falling back to /');
        filePaths.push('/');
    }

    let absoluteDestPath = filePaths.pop();
    if (!path.isAbsolute(absoluteDestPath)) exit('Target directory must be absolute, starting with /');
    if (!absoluteDestPath.endsWith('/')) absoluteDestPath += '/';

    let localFiles = [];
    filePaths.forEach(function (filePath) {
        const absoluteFilePath = path.resolve(process.cwd(), filePath);
        const baseFilePath = path.dirname(absoluteFilePath);

        localFiles = localFiles.concat(collectFiles(absoluteFilePath, baseFilePath, options));
    });

    let remoteFiles = [];

    const query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    query.recursive = true;

    // check if destination is a directory. because path contains trailing /, it won't download any file
    const [error, response] = await safe(superagent.get(`${gServer}${API}${absoluteDestPath}`).query(query).ok(() => true));
    if (error) return exit(error);
    if (response.status === 401) return exit('Invalid token');
    if (response.status === 404) { // 404 means remote not found so upload all
        remoteFiles = [];
    } else if (response.status === 222) { // directory listing
        remoteFiles = response.body.entries;
    } else {
        return exit(`Destination is not a directory. Cannot continue. ${requestError(response)}`);
    }

    // we need to find below two lists of files for syncing
    let remoteFilesNotLocalAnymore = [];
    const newLocalFiles = localFiles.filter(function (local) {
        return !remoteFiles.find(function (remote) {
            if (remote.filePath !== path.join(absoluteDestPath, local.filePath)) return false;
            if (local.isDirectory) return true;

            if (remote.mtime !== local.mtime) return false;
            if (remote.size !== local.size) return false;

            return true;
        });
    }).map(function (f) { return path.join(absoluteDestPath, f.filePath); });

    // find removed local files if --delete flag passed
    if (options.delete) remoteFilesNotLocalAnymore = remoteFiles.filter(function (remote) {
        return !localFiles.find(function (local) {
            return remote.filePath === path.join(absoluteDestPath, local.filePath);
        });
    });

    // first purging remote files
    const [purgeError] = await safe(async.eachLimit(remoteFilesNotLocalAnymore, 10, async function purgeFile(remoteFile) {
        console.log(`Removing ${remoteFile.filePath}`);
        const file = remoteFiles.find(function (f) { return f.filePath === remoteFile.filePath; });
        if (!file) throw new Error(`File not found ${remoteFile.filePath}`);
        await delOne(file);
    }));
    if (purgeError) return exit(purgeError);

    // now upload new files
    const [uploadError] = await safe(async.eachLimit(newLocalFiles, 10, async function uploadFile(filePath) {
        const file = localFiles.find(function (f) { return path.join(absoluteDestPath, f.filePath) === filePath; });
        if (!file) throw new Error(`File not found ${filePath}`);

        await putOne(file, absoluteDestPath);
    }));
    if (uploadError) return exit(uploadError);

    console.log('Done');
}

export default {
    configure,
    put,
    get,
    del,
};
