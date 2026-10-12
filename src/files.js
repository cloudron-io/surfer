'use strict';

import fs from 'node:fs';
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

function isProtected(root, targetPath) {
    return sites.contains(path.resolve(root, '_admin'), targetPath);
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

async function collectFiles(root, folderPath, recursive) {
    const list = await fsPromises.readdir(folderPath);
    const results = [];

    for (const file of list) {
        const filePath = path.resolve(folderPath, file);
        const stat = await fsPromises.stat(filePath);
        results.push(entryFromStat(root, filePath, file, stat));

        if (stat.isDirectory() && recursive) {
            const nested = await collectFiles(root, filePath, recursive);
            for (const entry of nested) results.push(entry);
        }
    }

    return results;
}

function rootFor(host, deployment) {
    return sites.rootForRequest(host, deployment);
}

function transferRoots(host, deployment, sourceDeployment) {
    const destination = rootFor(host, deployment);
    if (sourceDeployment == null || sourceDeployment === '') return { source: destination, destination };
    return { source: sites.rootForName(sourceDeployment), destination: destination };
}

async function uniquePath(targetPath) {
    if (!fs.existsSync(targetPath)) return targetPath;

    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);

    for (let i = 1; ; ++i) {
        const candidate = path.join(dir, `${base} (${i})${ext}`);
        if (!fs.existsSync(candidate)) return candidate;
    }
}

async function get(host, deployment, filePath, recursive) {
    const root = rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let stat;
    try {
        stat = await fsPromises.stat(absoluteFilePath);
    } catch (error) {
        throw new SurferError(SurferError.NOT_FOUND, error);
    }

    console.log('get:', absoluteFilePath);

    if (!stat.isDirectory() && !stat.isFile()) throw new SurferError(SurferError.INTERNAL_ERROR, 'unsupported type');
    if (stat.isFile()) return { type: 'file', path: absoluteFilePath };

    let entries;
    try {
        entries = await collectFiles(root, absoluteFilePath, recursive);
    } catch (error) {
        throw new SurferError(SurferError.FS_ERROR, error);
    }

    return {
        type: 'directory',
        stat: entryFromStat(root, absoluteFilePath, '', stat),
        entries: entries
    };
}

async function add(host, deployment, filePath, directory, uploadPath, mtime) {
    console.log('post:', filePath, mtime);

    const root = rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath || isProtected(root, absoluteFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let existing = null;
    try {
        existing = await fsPromises.stat(absoluteFilePath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw new SurferError(SurferError.FS_ERROR, error);
    }

    if (existing && directory) throw new SurferError(SurferError.ALREADY_EXISTS, 'name already exists');
    if (existing && existing.isDirectory()) throw new SurferError(SurferError.CONFLICT, 'cannot post on directories');

    if (directory) {
        try {
            await fsPromises.mkdir(absoluteFilePath, { recursive: true });
        } catch (error) {
            throw new SurferError(SurferError.FS_ERROR, error);
        }
        return;
    }

    if (!existing || existing.isFile()) {
        try {
            await fsPromises.mkdir(path.dirname(absoluteFilePath), { recursive: true });
            await fsPromises.copyFile(uploadPath, absoluteFilePath);
            if (mtime) await fsPromises.utimes(absoluteFilePath, mtime, mtime);
        } catch (error) {
            throw new SurferError(SurferError.FS_ERROR, error);
        }
        return;
    }

    throw new SurferError(SurferError.INTERNAL_ERROR, 'unsupported type');
}

async function move(host, deployment, sourceDeployment, oldFilePath, newFilePath, overwrite) {
    console.log('put: %s -> %s', oldFilePath, newFilePath);

    const roots = transferRoots(host, deployment, sourceDeployment);
    const absoluteOldFilePath = absolutePath(roots.source, oldFilePath);
    if (!absoluteOldFilePath || isProtected(roots.source, absoluteOldFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const absoluteNewFilePath = absolutePath(roots.destination, newFilePath);
    if (!absoluteNewFilePath || isProtected(roots.destination, absoluteNewFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let targetPath = absoluteNewFilePath;
    if (overwrite === false) {
        try {
            await fsPromises.stat(absoluteNewFilePath);
            throw new SurferError(SurferError.ALREADY_EXISTS, 'destination exists');
        } catch (error) {
            if (error instanceof SurferError) throw error;
        }
    } else if (overwrite === 'rename') {
        targetPath = await uniquePath(absoluteNewFilePath);
    }

    try {
        await fsPromises.rename(absoluteOldFilePath, targetPath);
    } catch (error) {
        throw new SurferError(SurferError.FS_ERROR, error);
    }

    console.log('put: successful');
}

async function copy(host, deployment, sourceDeployment, sources, destination) {
    const roots = transferRoots(host, deployment, sourceDeployment);
    const absoluteDestination = absolutePath(roots.destination, destination);
    if (!absoluteDestination || isProtected(roots.destination, absoluteDestination)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    for (const sourceFilePath of sources) {
        const absoluteSource = absolutePath(roots.source, sourceFilePath);
        if (!absoluteSource || isProtected(roots.source, absoluteSource)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

        const targetPath = await uniquePath(path.join(absoluteDestination, path.basename(absoluteSource)));
        try {
            await fsPromises.cp(absoluteSource, targetPath, { recursive: true });
        } catch (error) {
            throw new SurferError(SurferError.FS_ERROR, error.message);
        }
    }
}

async function remove(host, deployment, filePath, recursive) {
    const root = rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.NOT_FOUND, 'Not found');
    if (isProtected(root, absoluteFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let stat;
    try {
        stat = await fsPromises.stat(absoluteFilePath);
    } catch (error) {
        throw new SurferError(SurferError.NOT_FOUND, error);
    }

    if (stat.isDirectory() && !recursive) throw new SurferError(SurferError.ACCESS_DENIED, 'Is directory');

    try {
        await fsPromises.rm(absoluteFilePath, { recursive: true });
    } catch (error) {
        console.error(error);
        throw new SurferError(SurferError.FS_ERROR, 'Unable to remove');
    }
}

async function zipSources(host, deployment, filePaths) {
    const root = rootFor(host, deployment);
    const absolutePaths = [];
    for (const filePath of filePaths) {
        const resolved = path.resolve(path.join(root, filePath));
        if (!sites.contains(root, resolved)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');
        absolutePaths.push(resolved);
    }
    return absolutePaths;
}

export default {
    get,
    add,
    move,
    copy,
    remove,
    zipSources,
};
