'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import safe from '@cloudron/safetydance';
import domains from './domains.js';

// primaryRoot is the real public/ directory (Default). Other sites are sibling directories
// public-<name>. A host with no sites row, including an alias, serves Default.
// CLOUDRON_ALIAS_DOMAINS is a comma-separated list of exact hostnames and single-label
// wildcards such as *.example.com.
const primaryRoot = path.resolve(import.meta.dirname, '..', process.argv[2] || 'files');
const dataDir = path.dirname(primaryRoot);

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

const current = new AsyncLocalStorage();

export default {
    primaryRoot,
    dataDir,
    aliasPatterns,
    primaryName,
    isDeployName,
    matchAlias,
    resolveRequest,
    readDeployment,
    rootForQuery,
    deploymentRoot,
    rootForPublicDir,
    prepare,
    contains,
    run,
    currentRoot,
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

function resolveRequest(req) {
    const host = requestHost(req);
    const mapped = domains.publicDirForHost(host);
    if (mapped) {
        const root = rootForPublicDir(mapped);
        if (root) return { site: host === primaryName() ? '' : host, root };
    }

    // Primary and any alias without its own site both serve Default.
    return { site: '', root: primaryRoot };
}

function badDeployment(text) {
    const error = new Error(text);
    error.code = 'EBADDEPLOYMENT';
    return error;
}

function decodeName(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw !== 'string') throw badDeployment('invalid deployment');

    const decoded = safe(function () { return decodeURIComponent(raw); });
    if (safe.error) throw badDeployment('invalid deployment');
    return decoded.trim().toLowerCase();
}

function deploymentRoot(name) {
    if (!name || name === 'default') return primaryRoot;

    const root = rootForPublicDir('public-' + name);
    if (!root || !fs.existsSync(root)) return null;
    return root;
}

function readDeployment(req) {
    const name = decodeName(req.headers && req.headers['surfer-deployment']);
    if (!name) return 'default';
    if (!deploymentRoot(name)) throw badDeployment('unknown deployment');
    return name;
}

function rootForQuery(req) {
    const raw = req.query && req.query.deployment;
    if (raw == null || raw === '') return resolveRequest(req).root;

    const name = decodeName(raw);
    if (!name) return resolveRequest(req).root;

    const root = deploymentRoot(name);
    if (!root) throw badDeployment('unknown deployment');
    return root;
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
