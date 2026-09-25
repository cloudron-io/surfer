'use strict';

import fs from 'node:fs';
import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import domains from './domains.js';
import sites from './sites.js';

export default {
    list,
    create,
};

function deployName(publicDir) {
    if (publicDir === 'public') return 'default';
    if (typeof publicDir === 'string' && publicDir.startsWith('public-')) return publicDir.slice('public-'.length);
    return publicDir;
}

function list(req, res, next) {
    const rows = safe(function () { return domains.list(); });
    if (safe.error) {
        console.error('sites:', safe.error);
        return next(new HttpError(500, 'failed to list sites'));
    }

    const body = (rows || []).map(function (row) {
        return { name: deployName(row.publicDir), publicDir: row.publicDir, domain: row.domain };
    });
    next(new HttpSuccess(200, body));
}

function create(req, res, next) {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
    const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';

    if (!sites.isDeployName(name)) return next(new HttpError(400, 'invalid site name'));

    const publicDir = name === 'default' ? 'public' : ('public-' + name);
    if (domains.publicDirInUse(publicDir)) return next(new HttpError(409, 'site already exists'));

    const root = sites.rootForPublicDir(publicDir);
    if (!root) return next(new HttpError(400, 'invalid site name'));
    if (fs.existsSync(root)) return next(new HttpError(409, 'site already exists'));

    if (!domain || domain === sites.primaryName() || !sites.matchAlias(domain)) return next(new HttpError(400, 'domain must be an alias'));
    if (domains.publicDirForHost(domain)) return next(new HttpError(409, 'domain is already mapped'));

    safe(function () { fs.mkdirSync(root); });
    if (safe.error) return next(new HttpError(500, safe.error.message));

    safe(function () { domains.insert(domain, publicDir); });
    if (safe.error) return next(new HttpError(500, safe.error.message));

    next(new HttpSuccess(201, { name: name, publicDir: publicDir, domain: domain }));
}
