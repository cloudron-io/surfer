'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import safe from '@cloudron/safetydance';

// The primary domain serves primaryRoot (public/). Each alias hostname serves
// a sibling directory public-<hostname>. CLOUDRON_ALIAS_DOMAINS is a comma-separated
// list of exact hostnames and single-label wildcards such as *.example.com.
const primaryRoot = path.resolve(import.meta.dirname, '..', process.argv[2] || 'files');
const dataDir = path.dirname(primaryRoot);

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

const current = new AsyncLocalStorage();

export default {
    primaryRoot,
    dataDir,
    aliasPatterns,
    resolveRequest,
    readSite,
    folderForHostname,
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

function isHostname(value) {
    return typeof value === 'string' && value.length <= 253 && HOSTNAME.test(value);
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

function folderForHostname(hostname) {
    if (!isHostname(hostname)) return null;

    const root = path.resolve(dataDir, 'public-' + hostname);
    if (!contains(dataDir, root)) return null;
    return root;
}

function resolveRequest(req) {
    const site = matchAlias(requestHost(req));
    if (!site) return { site: '', root: primaryRoot };

    return { site, root: folderForHostname(site) };
}

function badSite(text) {
    const error = new Error(text);
    error.code = 'EBADSITE';
    return error;
}

function readSite(req) {
    const raw = req.headers && req.headers['surfer-site'];
    if (raw == null || raw === '') return '';
    if (typeof raw !== 'string') throw badSite('invalid site');

    const decoded = safe(function () { return decodeURIComponent(raw); });
    if (safe.error) throw badSite('invalid site');

    const site = decoded.trim().toLowerCase();
    if (!site) return '';
    if (!matchAlias(site)) throw badSite('unknown site');
    return site;
}

function prepare() {
    for (const pattern of aliasPatterns()) {
        if (pattern.includes('*') || !isHostname(pattern)) continue;
        fs.mkdirSync(folderForHostname(pattern), { recursive: true });
    }
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
