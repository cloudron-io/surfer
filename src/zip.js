'use strict';

import fs from 'node:fs/promises';
import path from 'path';
import { ZipArchive } from 'archiver';

async function zipPaths(absolutePaths, baseName, res) {
    let entries;

    try {
        entries = await Promise.all(absolutePaths.map(async function (absolutePath) {
            const stat = await fs.stat(absolutePath);
            return { absolutePath, name: path.basename(absolutePath), isDirectory: stat.isDirectory() };
        }));
    } catch (error) {
        console.error('zip: failed to stat entries', error);
        res.status(500).send('Failed to read entry');
        return;
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('warning', function (error) {
        console.warn('zip warning:', error);
    });

    archive.on('error', function (error) {
        console.error('zip error:', error);
        if (res.headersSent) res.destroy();
        else res.status(500).send('Failed to create zip');
    });

    res.attachment(`${baseName}.zip`);

    for (const entry of entries) {
        if (entry.isDirectory) archive.directory(entry.absolutePath, entry.name);
        else archive.file(entry.absolutePath, { name: entry.name });
    }

    archive.pipe(res);
    archive.finalize();
}

export default { zipPaths };
