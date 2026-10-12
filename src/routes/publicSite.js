'use strict';

import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';
import { create as createContentDisposition } from 'content-disposition';
import { HttpError } from '@cloudron/connect-lastmile';
import safe from '@cloudron/safetydance';
import publicSite from '../publicSite.js';
import settings from '../settings.js';
import sites from '../sites.js';
import SurferError from '../surfererror.js';
import zip from '../zip.js';
import accessRoutes from './access.js';

const appRoot = path.resolve(import.meta.dirname, '../..');
const ASSET_MAX_AGE = 3600;
const MAX_ZIP_PATHS = 100;

const publicHtmlFile = path.join(appRoot, 'dist', 'public.html');
const publicHtml = fs.existsSync(publicHtmlFile) ? fs.readFileSync(publicHtmlFile, 'utf8') : '';
const publicNoscriptEjs = fs.readFileSync(path.join(appRoot, 'src', 'public.noscript.ejs'), 'utf8');
const staticByRoot = new Map();

function cacheControlFor(filePath) {
    const config = settings.current();
    const name = path.basename(filePath).toLowerCase();
    const indexName = path.basename(config.index || 'index.html').toLowerCase();
    const revalidate = name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.xml') || name === indexName;
    const visibility = config.accessRestriction ? 'private' : 'public';

    return visibility + ', max-age=' + (revalidate ? 0 : ASSET_MAX_AGE);
}

function setServMiddlewareHeaders(res, filePath) {
    // handle ?download in query
    if ('download' in res.req.query) res.setHeader('Content-Disposition', createContentDisposition(path.basename(filePath)));

    const cacheControl = cacheControlFor(filePath);
    res.setHeader('Cache-Control', cacheControl);

    // tegel sets Cache-Control: no-store when Content-Type contains text/html, and that write happens after this hook
    const setHeader = res.setHeader;
    res.setHeader = function (name, value) {
        const result = setHeader.call(this, name, value);
        if (String(name).toLowerCase() === 'content-type') setHeader.call(this, 'Cache-Control', cacheControl);
        return result;
    };
}

function staticFor(express, root) {
    let middleware = staticByRoot.get(root);
    if (middleware) return middleware;

    const config = settings.current();
    middleware = express.static(root, { index: [ config.index || 'index.html', 'index.xml' ], setHeaders: setServMiddlewareHeaders, dotfiles: 'allow' });
    staticByRoot.set(root, middleware);
    return middleware;
}

function resetStatic() {
    staticByRoot.clear();
}

function send404(req, res) {
    const root = sites.resolveRequest(req).root;

    // first check if /404.htm(l) exists, if so send that
    if (fs.existsSync(path.join(root, '404.html'))) return res.status(404).sendFile(path.join(root, '404.html'));
    if (fs.existsSync(path.join(root, '404.htm' ))) return res.status(404).sendFile(path.join(root, '404.htm'));

    res.status(404).sendFile(path.join(appRoot, 'dist', '404.html'));
}

function parsePaths(req, next) {
    if (typeof req.query.paths !== 'string' || !req.query.paths) {
        next(new HttpError(400, 'missing paths'));
        return null;
    }

    const filePaths = safe.JSON.parse(req.query.paths);
    if (!filePaths) {
        next(new HttpError(400, 'invalid paths'));
        return null;
    }

    if (!Array.isArray(filePaths) || !filePaths.length || !filePaths.every(function (entry) { return typeof entry === 'string'; })) {
        next(new HttpError(400, 'invalid paths'));
        return null;
    }
    if (filePaths.length > MAX_ZIP_PATHS) {
        next(new HttpError(400, 'too many paths'));
        return null;
    }

    return filePaths;
}

function allowZip(req, res, next) {
    const deployment = req.query.deployment;
    if (deployment != null && deployment !== '') return next('route');
    if (!settings.current().folderListingEnabled) return next('route');

    return accessRoutes.handleProtection(req, res, next);
}

async function zipDownload(req, res, next) {
    const filePaths = parsePaths(req, next);
    if (!filePaths) return;

    const root = sites.resolveRequest(req).root;
    const [error, absolutePaths] = await safe(publicSite.zipSources(root, filePaths));
    if (error) return next(SurferError.toHttpError(error));

    const name = (typeof req.query.name === 'string' && req.query.name) ? req.query.name : 'download';
    zip.zipPaths(absolutePaths, name, res);
}

function install(app, express) {
    app.get('/build.json', function (req, res, next) {
        const buildFile = path.join(appRoot, 'dist', 'build.json');
        if (!fs.existsSync(buildFile)) return next();
        res.sendFile(buildFile);
    });

    app.use('/_admin', express.static(path.join(appRoot, 'dist'), { index: 'admin.html' }));
    app.use('/assets', express.static(path.join(appRoot, 'dist', 'assets')));
    app.use('/', accessRoutes.handleProtection);
    app.use('/', function (req, res, next) {
        const root = sites.resolveRequest(req).root;
        if (!fs.existsSync(root)) return next();
        staticFor(express, root)(req, res, next);
    });
    app.use('/', function welcomePage(req, res, next) {
        if (settings.current().folderListingEnabled || req.path !== '/') return next();
        res.status(200).sendFile(path.join(appRoot, 'dist', 'welcome.html'));
    });
    app.use('/', async function (req, res, next) {
        if (!settings.current().folderListingEnabled) return send404(req, res);

        const root = sites.resolveRequest(req).root;
        const filePath = req.path ? decodeURIComponent(req.path) : '';
        if (!fs.existsSync(path.join(root, filePath))) return send404(req, res);

        const [error, result] = await safe(publicSite.listDirectory(root, filePath));
        if (error) return next(SurferError.toHttpError(error));

        // use cached public html when deployed otherwise reread from disk for development
        let out = process.env.CLOUDRON ? publicHtml : fs.readFileSync(publicHtmlFile, 'utf8');
        out = out.replace('<noscript></noscript>', `<noscript>${ejs.render(publicNoscriptEjs, result, {})}</noscript>`);
        out = out.replace('<withscript></withscript>', `<script>window.surfer = { entries: ${JSON.stringify(result.entries)}, stat: ${JSON.stringify(result.stat)} };</script>`);

        res.status(200).send(out);
    });
}

export { resetStatic };

export default {
    allowZip,
    zipDownload,
    install,
};
