'use strict';

import fs from 'node:fs/promises';
import path from 'node:path';
import safe from '@cloudron/safetydance';
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

function collectFiles(root, folderPath, recursive) {
    const list = safe.fs.readdirSync(folderPath);
    if (!list) throw new SurferError(SurferError.FS_ERROR, safe.error);

    const results = [];
    for (const file of list) {
        const filePath = path.resolve(folderPath, file);
        const stat = safe.fs.statSync(filePath);
        if (!stat) throw new SurferError(SurferError.FS_ERROR, safe.error);
        results.push(entryFromStat(root, filePath, file, stat));

        if (stat.isDirectory() && recursive) {
            const nested = collectFiles(root, filePath, recursive);
            for (const entry of nested) results.push(entry);
        }
    }

    return results;
}

async function rootFor(host, deployment) {
    return sites.rootForRequest(host, deployment);
}

async function transferRoots(host, deployment, sourceDeployment) {
    const destination = await rootFor(host, deployment);
    if (sourceDeployment == null || sourceDeployment === '') return { source: destination, destination };
    return { source: await sites.rootForName(sourceDeployment), destination: destination };
}

function uniquePath(targetPath) {
    if (safe.fs.existsSync(targetPath)) {
        const dir = path.dirname(targetPath);
        const ext = path.extname(targetPath);
        const base = path.basename(targetPath, ext);

        for (let i = 1; ; ++i) {
            const candidate = path.join(dir, `${base} (${i})${ext}`);
            if (!safe.fs.existsSync(candidate)) return candidate;
        }
    }

    return targetPath;
}

async function get(host, deployment, filePath, recursive) {
    const root = await rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const stat = safe.fs.statSync(absoluteFilePath);
    if (!stat) throw new SurferError(SurferError.NOT_FOUND, safe.error);

    console.log('get:', absoluteFilePath);

    if (!stat.isDirectory() && !stat.isFile()) throw new SurferError(SurferError.INTERNAL_ERROR, 'unsupported type');
    if (stat.isFile()) return { type: 'file', path: absoluteFilePath };

    return {
        type: 'directory',
        stat: entryFromStat(root, absoluteFilePath, '', stat),
        entries: collectFiles(root, absoluteFilePath, recursive)
    };
}

async function add(host, deployment, filePath, directory, uploadPath, mtime) {
    console.log('post:', filePath, mtime);

    const root = await rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath || isProtected(root, absoluteFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const existing = safe.fs.statSync(absoluteFilePath);
    if (!existing && safe.error && safe.error.code !== 'ENOENT') throw new SurferError(SurferError.FS_ERROR, safe.error);

    if (existing && directory) throw new SurferError(SurferError.ALREADY_EXISTS, 'name already exists');
    if (existing && existing.isDirectory()) throw new SurferError(SurferError.CONFLICT, 'cannot post on directories');

    if (directory) {
        if (!safe.fs.mkdirSync(absoluteFilePath, { recursive: true })) throw new SurferError(SurferError.FS_ERROR, safe.error);
        return;
    }

    if (!existing || existing.isFile()) {
        if (!safe.fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true })) throw new SurferError(SurferError.FS_ERROR, safe.error);
        const [copyError] = await safe(fs.copyFile(uploadPath, absoluteFilePath));
        if (copyError) throw new SurferError(SurferError.FS_ERROR, copyError);
        if (mtime && !safe.fs.utimesSync(absoluteFilePath, mtime, mtime)) throw new SurferError(SurferError.FS_ERROR, safe.error);
        return;
    }

    throw new SurferError(SurferError.INTERNAL_ERROR, 'unsupported type');
}

async function move(host, deployment, sourceDeployment, oldFilePath, newFilePath, overwrite) {
    console.log('put: %s -> %s', oldFilePath, newFilePath);

    const roots = await transferRoots(host, deployment, sourceDeployment);
    const absoluteOldFilePath = absolutePath(roots.source, oldFilePath);
    if (!absoluteOldFilePath || isProtected(roots.source, absoluteOldFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const absoluteNewFilePath = absolutePath(roots.destination, newFilePath);
    if (!absoluteNewFilePath || isProtected(roots.destination, absoluteNewFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    let targetPath = absoluteNewFilePath;
    if (overwrite === false) {
        if (safe.fs.statSync(absoluteNewFilePath)) throw new SurferError(SurferError.ALREADY_EXISTS, 'destination exists');
    } else if (overwrite === 'rename') {
        targetPath = uniquePath(absoluteNewFilePath);
    }

    if (!safe.fs.renameSync(absoluteOldFilePath, targetPath)) throw new SurferError(SurferError.FS_ERROR, safe.error);

    console.log('put: successful');
}

async function copy(host, deployment, sourceDeployment, sources, destination) {
    const roots = await transferRoots(host, deployment, sourceDeployment);
    const absoluteDestination = absolutePath(roots.destination, destination);
    if (!absoluteDestination || isProtected(roots.destination, absoluteDestination)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    for (const sourceFilePath of sources) {
        const absoluteSource = absolutePath(roots.source, sourceFilePath);
        if (!absoluteSource || isProtected(roots.source, absoluteSource)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

        const targetPath = uniquePath(path.join(absoluteDestination, path.basename(absoluteSource)));
        const [copyError] = await safe(fs.cp(absoluteSource, targetPath, { recursive: true }));
        if (copyError) throw new SurferError(SurferError.FS_ERROR, copyError.message);
    }
}

async function remove(host, deployment, filePath, recursive) {
    const root = await rootFor(host, deployment);
    const absoluteFilePath = absolutePath(root, filePath);
    if (!absoluteFilePath) throw new SurferError(SurferError.NOT_FOUND, 'Not found');
    if (isProtected(root, absoluteFilePath)) throw new SurferError(SurferError.ACCESS_DENIED, 'Path not allowed');

    const stat = safe.fs.statSync(absoluteFilePath);
    if (!stat) throw new SurferError(SurferError.NOT_FOUND, safe.error);

    if (stat.isDirectory() && !recursive) throw new SurferError(SurferError.ACCESS_DENIED, 'Is directory');

    if (!safe.fs.rmSync(absoluteFilePath, { recursive: true })) {
        console.error(safe.error);
        throw new SurferError(SurferError.FS_ERROR, 'Unable to remove');
    }
}

async function zipSources(host, deployment, filePaths) {
    const root = await rootFor(host, deployment);
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
