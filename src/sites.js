'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import safe from '@cloudron/safetydance';
import domains from './domains.js';
import SurferError from './surfererror.js';

// primaryRoot is the real public/ directory (Default). Other sites are sibling directories
// public-<name>. A host with no sites row, including an alias, serves Default.
// CLOUDRON_ALIAS_DOMAINS is a comma-separated list of exact hostnames and single-label
// wildcards such as *.example.com.
const primaryRoot = path.resolve(import.meta.dirname, '..', process.argv[2] || 'files');
const dataDir = path.dirname(primaryRoot);

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

const current = new AsyncLocalStorage();

let gDeploying = false;

export default {
    primaryRoot,
    dataDir,
    aliasPatterns,
    primaryName,
    isDeployName,
    matchAlias,
    resolveRequest,
    requestHost,
    readDeployment,
    readDeploymentHeader,
    rootForQuery,
    rootForRequest,
    rootForName,
    deploymentRoot,
    rootForPublicDir,
    prepare,
    contains,
    run,
    currentRoot,
    tryLock,
    unlock,
    list,
    create,
    update,
    remove,
};

function aliasPatterns() {
    return (process.env.CLOUDRON_ALIAS_DOMAINS || '').split(',')
        .map(function (pattern) { return pattern.trim().toLowerCase(); })
        .filter(Boolean);
}

function primaryHost() {
    return (process.env.CLOUDRON_APP_DOMAIN || '').trim().toLowerCase();
}

function primaryName() {
    return primaryHost() || 'localhost';
}

function isHostname(value) {
    return typeof value === 'string' && value.length <= 253 && HOSTNAME.test(value);
}

function isDeployName(value) {
    return typeof value === 'string' && new RegExp(`^${LABEL}$`).test(value);
}

function requestHost(req) {
    const raw = (req.headers && req.headers.host) || '';
    if (raw.startsWith('[')) {
        const end = raw.indexOf(']');
        return end === -1 ? '' : raw.slice(1, end).toLowerCase();
    }
    return raw.split(':')[0].trim().toLowerCase();
}

// *.example.com matches docs.example.com and not example.com or a.b.example.com.
function matchesPattern(hostname, pattern) {
    if (!pattern.includes('*')) return hostname === pattern;
    if (!pattern.startsWith('*.')) return false;

    const suffix = pattern.slice(1);
    if (!hostname.endsWith(suffix) || hostname.length <= suffix.length) return false;

    const label = hostname.slice(0, hostname.length - suffix.length);
    return new RegExp(`^${LABEL}$`).test(label);
}

function matchAlias(hostname) {
    if (!isHostname(hostname) || hostname === primaryHost()) return null;

    const patterns = aliasPatterns();
    if (patterns.includes(hostname)) return hostname;

    for (const pattern of patterns) {
        if (pattern.includes('*') && matchesPattern(hostname, pattern)) return hostname;
    }

    return null;
}

function rootForPublicDir(name) {
    if (name === 'public') return primaryRoot;
    if (typeof name !== 'string' || !name.startsWith('public-')) return null;

    const suffix = name.slice('public-'.length);
    if (!suffix || suffix === '.' || suffix === '..' || suffix.includes('/') || suffix.includes('\\')) return null;

    const root = path.resolve(dataDir, name);
    if (!contains(dataDir, root)) return null;
    return root;
}

function resolveHost(host) {
    const mapped = domains.publicDirForHost(host);
    if (mapped) {
        const root = rootForPublicDir(mapped);
        if (root) return { site: host === primaryName() ? '' : host, root };
    }

    // Primary and any alias without its own site both serve Default.
    return { site: '', root: primaryRoot };
}

function resolveRequest(req) {
    return resolveHost(requestHost(req));
}

function decodeName(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw !== 'string') throw new SurferError(SurferError.BAD_FIELD, 'invalid deployment');

    const decoded = safe(function () { return decodeURIComponent(raw); });
    if (safe.error) throw new SurferError(SurferError.BAD_FIELD, 'invalid deployment');
    return decoded.trim().toLowerCase();
}

function deploymentRoot(name) {
    if (!name || name === 'default') return primaryRoot;

    const root = rootForPublicDir('public-' + name);
    if (!root || !fs.existsSync(root)) return null;
    return root;
}

function readDeploymentHeader(raw) {
    const name = decodeName(raw);
    if (!name) return 'default';
    if (!deploymentRoot(name)) throw new SurferError(SurferError.BAD_FIELD, 'unknown deployment');
    return name;
}

function readDeployment(req) {
    return readDeploymentHeader(req.headers && req.headers['surfer-deployment']);
}

function rootForName(raw) {
    const name = decodeName(raw);
    if (!name || name === 'default') return primaryRoot;

    const root = deploymentRoot(name);
    if (!root) throw new SurferError(SurferError.BAD_FIELD, 'unknown deployment');
    return root;
}

function rootForRequest(host, raw) {
    if (raw == null || raw === '') return resolveHost(host).root;

    const name = decodeName(raw);
    if (!name) return resolveHost(host).root;
    return rootForName(name);
}

function rootForQuery(req) {
    return rootForRequest(requestHost(req), req.query && req.query.deployment);
}

function tryLock() {
    if (gDeploying) return false;
    gDeploying = true;
    return true;
}

function unlock() {
    gDeploying = false;
}

function deployName(publicDir) {
    if (publicDir === 'public') return 'default';
    if (typeof publicDir === 'string' && publicDir.startsWith('public-')) return publicDir.slice('public-'.length);
    return publicDir;
}

function conflictMessage(error) {
    const message = error && error.message ? error.message : '';
    if (!message.includes('UNIQUE constraint failed')) return '';
    if (message.includes('.domain')) return 'domain is already mapped';
    return 'site already exists';
}

function rowOrThrow(domain) {
    try {
        return domains.rowForDomain(domain);
    } catch (error) {
        throw new SurferError(SurferError.DATABASE_ERROR, error.message);
    }
}

async function list() {
    try {
        const rows = domains.list() || [];
        return rows.map(function (row) {
            return { name: deployName(row.publicDir), publicDir: row.publicDir, domain: row.domain };
        });
    } catch (error) {
        console.error('sites:', error);
        throw new SurferError(SurferError.DATABASE_ERROR, 'failed to list sites');
    }
}

async function create(name, domain) {
    if (!isDeployName(name)) throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');

    const publicDir = name === 'default' ? 'public' : ('public-' + name);
    const root = rootForPublicDir(publicDir);
    if (!root) throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');
    if (fs.existsSync(root)) throw new SurferError(SurferError.ALREADY_EXISTS, 'site already exists');

    if (!domain || domain === primaryName() || !matchAlias(domain)) throw new SurferError(SurferError.BAD_FIELD, 'domain must be an alias');
    if (domains.publicDirForHost(domain)) throw new SurferError(SurferError.ALREADY_EXISTS, 'domain is already mapped');

    try {
        domains.insert(domain, publicDir);
    } catch (error) {
        const conflict = conflictMessage(error);
        if (conflict) throw new SurferError(SurferError.ALREADY_EXISTS, conflict);
        throw new SurferError(SurferError.DATABASE_ERROR, error.message);
    }

    try {
        fs.mkdirSync(root);
    } catch (error) {
        try {
            domains.remove(domain);
        } catch { /* the insert is rolled back best-effort */ }
        throw new SurferError(SurferError.FS_ERROR, error.message);
    }

    return { name: name, publicDir: publicDir, domain: domain };
}

async function update(fromDomain, name, domain) {
    const row = rowOrThrow(fromDomain);
    if (!row) throw new SurferError(SurferError.NOT_FOUND, 'unknown site');
    if (row.publicDir === 'public') throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');

    if (!isDeployName(name) || name === 'default') throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');
    if (!domain || domain === primaryName() || !matchAlias(domain)) throw new SurferError(SurferError.BAD_FIELD, 'domain must be an alias');

    const fromName = deployName(row.publicDir);
    const publicDir = 'public-' + name;
    if (name !== fromName) {
        const nextRoot = rootForPublicDir(publicDir);
        if (!nextRoot) throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');
        if (fs.existsSync(nextRoot)) throw new SurferError(SurferError.ALREADY_EXISTS, 'site already exists');
    }

    if (domain !== fromDomain && domains.publicDirForHost(domain)) throw new SurferError(SurferError.ALREADY_EXISTS, 'domain is already mapped');

    const oldRoot = rootForPublicDir(row.publicDir);
    if (!oldRoot || !fs.existsSync(oldRoot)) throw new SurferError(SurferError.BAD_FIELD, 'unknown site');
    if (name === fromName && domain === fromDomain) return { name: name, publicDir: row.publicDir, domain: domain };

    if (!tryLock()) throw new SurferError(SurferError.BUSY, 'a deploy is already in progress');

    const nextRoot = rootForPublicDir(publicDir);
    let renamed = false;
    try {
        if (name !== fromName) {
            try {
                fs.renameSync(oldRoot, nextRoot);
            } catch (error) {
                throw new SurferError(SurferError.FS_ERROR, error.message);
            }
            renamed = true;
        }

        try {
            domains.updateSite(fromDomain, row.publicDir, publicDir, domain);
        } catch (error) {
            if (renamed) {
                try {
                    fs.renameSync(nextRoot, oldRoot);
                } catch { /* leave the renamed folder if the rollback fails */ }
            }
            const conflict = conflictMessage(error);
            if (conflict) throw new SurferError(SurferError.ALREADY_EXISTS, conflict);
            throw new SurferError(SurferError.DATABASE_ERROR, error.message);
        }

        return { name: name, publicDir: publicDir, domain: domain };
    } finally {
        unlock();
    }
}

async function remove(domain) {
    const row = rowOrThrow(domain);
    if (!row) throw new SurferError(SurferError.NOT_FOUND, 'unknown site');
    if (row.publicDir === 'public') throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');

    const root = rootForPublicDir(row.publicDir);
    if (!root || root === primaryRoot) throw new SurferError(SurferError.BAD_FIELD, 'invalid site name');

    if (!tryLock()) throw new SurferError(SurferError.BUSY, 'a deploy is already in progress');

    try {
        if (fs.existsSync(root)) {
            try {
                fs.rmSync(root, { recursive: true, force: true });
            } catch (error) {
                throw new SurferError(SurferError.FS_ERROR, error.message);
            }
        }

        try {
            domains.remove(domain);
        } catch (error) {
            throw new SurferError(SurferError.DATABASE_ERROR, error.message);
        }
    } finally {
        unlock();
    }
}

function prepare() {
}

function contains(root, absolute) {
    const base = path.resolve(root);
    const target = path.resolve(absolute);
    return target === base || target.startsWith(base + path.sep);
}

function run(req, fn) {
    current.run(resolveRequest(req), fn);
}

function currentRoot() {
    const value = current.getStore();
    return value ? value.root : primaryRoot;
}
