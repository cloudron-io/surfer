'use strict';

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { getMimeType } from './mime.js';
import sites from './sites.js';
import SurferError from './surfererror.js';

function absolutePath(root, filePath) {
    const resolved = path.resolve(path.join(root, filePath));
    if (!sites.contains(root, resolved)) return null;
    return resolved;
}

function removeBasePath(root, filePath) {
    return filePath.slice(path.resolve(root).length);
}

function entryFromStat(root, filePath, fileName, stat) {
    return {
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        atime: stat.atime,
        mtime: stat.mtime,
        ctime: stat.ctime,
        birthtime: stat.birthtime,
        size: stat.size,
        fileName: fileName,
        filePath: removeBasePath(root, filePath),
        mimeType: stat.isDirectory() ? null : getMimeType(fileName)
    };
}

async function listDirectory(root, filePath) {
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let stat;
    try {
        stat = await fsPromises.stat(absoluteFilePath);
    } catch (error) {
        throw new SurferError(SurferError.NOT_FOUND, error);
    }

    console.log('get', absoluteFilePath);

    if (!stat.isDirectory()) throw new SurferError(SurferError.INTERNAL_ERROR, 'unsupported type');

    let names;
    try {
        names = await fsPromises.readdir(absoluteFilePath);
    } catch (error) {
        throw new SurferError(SurferError.FS_ERROR, error);
    }

    const entries = [];
    for (const file of names) {
        const childPath = path.resolve(absoluteFilePath, file);
        let childStat;
        try {
            childStat = await fsPromises.stat(childPath);
        } catch (error) {
            throw new SurferError(SurferError.FS_ERROR, error);
        }
        entries.push(entryFromStat(root, childPath, file, childStat));
    }

    return { stat: entryFromStat(root, absoluteFilePath, '', stat), entries: entries };
}

async function zipSources(root, filePaths) {
    const absolutePaths = [];
    for (const filePath of filePaths) {
        const resolved = path.resolve(path.join(root, filePath));
        if (!sites.contains(root, resolved)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');
        absolutePaths.push(resolved);
    }
    return absolutePaths;
}

export default {
    listDirectory,
    zipSources,
};
