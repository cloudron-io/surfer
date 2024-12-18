'use strict';

import superagent from 'superagent';
import config from './config.js';
import readlineSync from 'readline-sync';
import safe from 'safetydance';
import async from 'async';
import fs from 'fs';
import url from 'url';
import path from 'path';
import 'colors';
import { Readable } from 'node:stream';

const API = '/api/files/';

let gServer = '';
let gQuery = {};

function exit(errorArgs) {
    if (errorArgs) {
        console.error.apply(console, arguments);
        process.exit(1);
    }

    process.exit(0);
}

function checkConfig(options) {
    if ((!options.server && !config.server()) || (!options.token && !config.accessToken())) exit('Run %s first, or provide %s', 'surfer config'.bold, '--server <domain>'.bold, '--token <access token>'.bold);

    if (options.server) {
        let tmp = url.parse(options.server);
        if (!tmp.slashes) tmp = url.parse('https://' + options.server);
        gServer = tmp.protocol + '//' + tmp.host;
    } else {
        gServer = config.server();
    }

    gQuery = { access_token: options.token || config.accessToken() };

    console.error('Using server %s'.white, gServer.cyan);
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
        console.log('Skipping %s', filePath.cyan);
    }

    return tmp;
}

function putOne(file, destination, callback) {
    const destinationPath = path.join(destination, file.filePath);

    if (file.isFile) {
        console.log('Uploading %s -> %s', file.filePath.cyan, (gServer + destinationPath).cyan);

        superagent.post(gServer + path.join(API, encodeURIComponent(destinationPath))).query(gQuery).attach('file', file.absoluteFilePath).field('mtime', file.mtime).end(function (error, result) {
            if (result && result.statusCode === 403) return callback(new Error('Destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error uploading file: ' + result.statusCode));
            if (error) return callback(error);

            callback(null);
        });
    } else if (file.isDirectory) {
        console.log('Creating directory %s', destinationPath.cyan);

        const query = safe.JSON.parse(safe.JSON.stringify(gQuery));
        query.directory = true;

        superagent.post(gServer + path.join(API, encodeURIComponent(destinationPath))).query(query).end(function (error, result) {
            if (result && result.statusCode === 409) return callback(null); // already exists, fine
            if (result && result.statusCode === 403) return callback(new Error('Destination ' + destinationPath + ' not allowed'));
            if (result && result.statusCode !== 201) return callback(new Error('Error creating directory: ' + result.statusCode));
            if (error) return callback(error);

            callback(null);
        });
    } else {
        callback(); // ignore
    }
}

function delOne(file, callback) {
    const query = safe.JSON.parse(safe.JSON.stringify(gQuery));
    if (file.isDirectory) query.recursive = true;

    superagent.del(gServer + path.join(API, encodeURIComponent(file.filePath))).query(query).end(function (error, result) {
        if (error && error.status === 401) return callback('Invalid token');
        if (error && error.status === 404) return callback(null); // file already removed
        if (error && error.status === 403) return callback('Failed. Target is a directory. Use --recursive to delete directories.');
        if (error) return callback('Failed %s', result ? result.body : error);

        callback(null);
    });
}

function configure(options) {
    checkConfig(options);

    superagent.get(gServer + '/api/profile').query(gQuery).end(function (error, result) {
        if (error && error.code === 'ENOTFOUND') exit('Server %s not found.'.red, gServer.bold);
        if (error && error.code) exit('Failed to connect to server %s'.red, gServer.bold, error.code);
        if (result.status !== 200) {
            console.log(result.status, gQuery);
            console.log('Access failed. Provide an api access token with --token\n'.red);
            process.exit(1);
        }

        config.set('server', gServer);
        config.set('accessToken', gQuery.access_token);

        console.log('Default server successfully set'.green);
    });
}

function login() {
    exit('Unsupported.'.red + ' Use "surfer config" instead.');
}

function logout() {
    exit('Unsupported.'.red + ` Delete the config file at ${config.filePath.bold} instead.`);
}

async function get(filePath, options) {
    checkConfig(options);

    // if no argument provided, fetch root
    filePath = filePath || '/';

    const url = new URL(gServer + path.join(API, encodeURIComponent(filePath)));
    url.search = new URLSearchParams(gQuery).toString();

    try {
        const response = await fetch(url, {});

        // 222 indicates directory listing
        if (response.status === 222) {
            const files = await response.json();
            if (!files || files.entries.length === 0) {
                console.log('Empty directory. Use %s to upload some.', 'surfer put <file>'.yellow);
            } else {
                console.log('Entries:');
                files.entries.forEach(function (entry) {
                    console.log('\t %s', entry.isDirectory ? entry.filePath + '/' : entry.filePath);
                });
            }
        } else if (response.status === 401) {
            exit('Invalid token');
        } else if (response.status === 404) {
            exit('No such file or directory %s', filePath.yellow);
        } else {
            Readable.fromWeb(response.body).pipe(process.stdout);
        }
    } catch (error) {
        exit(error.message);
    }
}

function del(filePath, options) {
    checkConfig(options);

    // construct a virtual file for further use
    const file = {
        filePath: filePath,
        isDirectory: !!options.recursive
    };

    if (filePath === '/') {
        if (!options.recursive) exit('To delete all files --recursive is required.'.yellow);
        if (!options.yes && !readlineSync.keyInYN('Really delete all files?')) exit();
    }

    delOne(file, function (error) {
        if (error) exit(error.red);
        else console.log('Success.');
    });
}

function put(filePaths, options) {
    checkConfig(options);

    if (filePaths.length < 2) {
        console.log('Target directory argument is missing. Falling back to /'.yellow);
        filePaths.push('/');
    }

    let absoluteDestPath = filePaths.pop();
    if (!path.isAbsolute(absoluteDestPath)) exit('Target directory must be absolute, starting with /'.red);
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

    superagent.get(gServer + path.join(API, absoluteDestPath)).query(query).end(function (error, result) {
        if (error) {
            if (error.status === 401) exit('Invalid token');
            if (error.status !== 404) exit(error.message);

            // 404 means remote not found so upload all
            remoteFiles = [];
        } else {
            // 222 indicates directory listing
            if (result.statusCode !== 222) exit('Destination is not a directory. Cannot continue.');
            remoteFiles = result.body.entries;
        }

        // we need to find below two lists of files for syncing
        let newLocalFiles = [];
        let remoteFilesNotLocalAnymore = [];

        // find new local files
        newLocalFiles = localFiles.filter(function (local) {
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
        async.eachLimit(remoteFilesNotLocalAnymore, 10, function (remoteFile, callback) {
            console.log(`Removing ${remoteFile.filePath.cyan}`);

            const file = remoteFiles.find(function (f) { return f.filePath === remoteFile.filePath; });
            if (!file) return callback(`File not found ${remoteFile.filePath}`);

            delOne(file, callback);
        }, function (error) {
            if (error) return exit(error.message);

            // now upload new files
            async.eachLimit(newLocalFiles, 10, function (filePath, callback) {
                const file = localFiles.find(function (f) { return path.join(absoluteDestPath, f.filePath) === filePath; });
                if (!file) return callback(`File not found ${filePath}`);

                putOne(file, absoluteDestPath, callback);
            }, function (error) {
                if (error) exit(error.message);

                console.log('Done');
            });
        });
    });
}

export default {
    login,
    logout,
    config: configure,
    put,
    get,
    del,
};
