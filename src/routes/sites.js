'use strict';

import fs from 'node:fs';
import safe from '@cloudron/safetydance';
import { HttpSuccess, HttpError } from '@cloudron/connect-lastmile';
import deploy from '../deploy.js';
import domains from '../domains.js';
import sites from '../sites.js';

export default {
    list,
    create,
    update,
    remove,
};

function conflictMessage(error) {
    const message = error && error.message ? error.message : '';
    if (!message.includes('UNIQUE constraint failed')) return '';
    if (message.includes('.domain')) return 'domain is already mapped';
    return 'site already exists';
}

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
    const root = sites.rootForPublicDir(publicDir);
    if (!root) return next(new HttpError(400, 'invalid site name'));
    if (fs.existsSync(root)) return next(new HttpError(409, 'site already exists'));

    if (!domain || domain === sites.primaryName() || !sites.matchAlias(domain)) return next(new HttpError(400, 'domain must be an alias'));
    if (domains.publicDirForHost(domain)) return next(new HttpError(409, 'domain is already mapped'));

    safe(function () { domains.insert(domain, publicDir); });
    if (safe.error) {
        const conflict = conflictMessage(safe.error);
        if (conflict) return next(new HttpError(409, conflict));
        return next(new HttpError(500, safe.error.message));
    }

    safe(function () { fs.mkdirSync(root); });
    if (safe.error) {
        const message = safe.error.message;
        safe(function () { domains.remove(domain); });
        return next(new HttpError(500, message));
    }

    next(new HttpSuccess(201, { name: name, publicDir: publicDir, domain: domain }));
}

function update(req, res, next) {
    const fromDomain = typeof req.params.domain === 'string' ? req.params.domain.trim().toLowerCase() : '';
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
    const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';

    const row = safe(function () { return domains.rowForDomain(fromDomain); });
    if (safe.error) return next(new HttpError(500, safe.error.message));
    if (!row) return next(new HttpError(404, 'unknown site'));
    if (row.publicDir === 'public') return next(new HttpError(400, 'invalid site name'));

    if (!sites.isDeployName(name) || name === 'default') return next(new HttpError(400, 'invalid site name'));
    if (!domain || domain === sites.primaryName() || !sites.matchAlias(domain)) return next(new HttpError(400, 'domain must be an alias'));

    const fromName = deployName(row.publicDir);
    const publicDir = 'public-' + name;
    if (name !== fromName) {
        const nextRoot = sites.rootForPublicDir(publicDir);
        if (!nextRoot) return next(new HttpError(400, 'invalid site name'));
        if (fs.existsSync(nextRoot)) return next(new HttpError(409, 'site already exists'));
    }

    if (domain !== fromDomain && domains.publicDirForHost(domain)) return next(new HttpError(409, 'domain is already mapped'));

    const oldRoot = sites.rootForPublicDir(row.publicDir);
    if (!oldRoot || !fs.existsSync(oldRoot)) return next(new HttpError(400, 'unknown site'));
    if (name === fromName && domain === fromDomain) return next(new HttpSuccess(200, { name: name, publicDir: row.publicDir, domain: domain }));

    if (!deploy.tryLock()) return next(new HttpError(409, 'a deploy is already in progress'));

    const nextRoot = sites.rootForPublicDir(publicDir);
    if (name !== fromName) {
        safe(function () { fs.renameSync(oldRoot, nextRoot); });
        if (safe.error) {
            deploy.unlock();
            return next(new HttpError(500, safe.error.message));
        }
    }

    safe(function () { domains.updateSite(fromDomain, row.publicDir, publicDir, domain); });
    if (safe.error) {
        const error = safe.error;
        if (name !== fromName) safe(function () { fs.renameSync(nextRoot, oldRoot); });
        deploy.unlock();
        const conflict = conflictMessage(error);
        if (conflict) return next(new HttpError(409, conflict));
        return next(new HttpError(500, error.message));
    }

    deploy.unlock();
    next(new HttpSuccess(200, { name: name, publicDir: publicDir, domain: domain }));
}

function remove(req, res, next) {
    const domain = typeof req.params.domain === 'string' ? req.params.domain.trim().toLowerCase() : '';
    const row = safe(function () { return domains.rowForDomain(domain); });
    if (safe.error) return next(new HttpError(500, safe.error.message));
    if (!row) return next(new HttpError(404, 'unknown site'));
    if (row.publicDir === 'public') return next(new HttpError(400, 'invalid site name'));

    const root = sites.rootForPublicDir(row.publicDir);
    if (!root || root === sites.primaryRoot) return next(new HttpError(400, 'invalid site name'));

    if (!deploy.tryLock()) return next(new HttpError(409, 'a deploy is already in progress'));

    if (fs.existsSync(root)) {
        safe(function () { fs.rmSync(root, { recursive: true, force: true }); });
        if (safe.error) {
            deploy.unlock();
            return next(new HttpError(500, safe.error.message));
        }
    }

    safe(function () { domains.remove(domain); });
    deploy.unlock();
    if (safe.error) return next(new HttpError(500, safe.error.message));

    next(new HttpSuccess(200, {}));
}
