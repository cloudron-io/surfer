'use strict';

import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';
import safe from '@cloudron/safetydance';
import { create as createContentDisposition } from 'content-disposition';
import { HttpError } from '@cloudron/connect-lastmile';
import files from './files.js';
import sites from '../sites.js';
import zip from '../zip.js';

const ASSET_MAX_AGE = 3600;
const MAX_ZIP_PATHS = 100;

function createPublic({ express, config, appRoot }) {
    const publicHtmlFile = path.join(appRoot, 'dist', 'public.html');
    const publicHtml = fs.existsSync(publicHtmlFile) ? fs.readFileSync(publicHtmlFile, 'utf8') : '';
    const publicNoscriptEjs = fs.readFileSync(path.join(appRoot, 'src', 'public.noscript.ejs'), 'utf8');
    const staticByRoot = new Map();

    function cacheControlFor(filePath) {
        const name = path.basename(filePath).toLowerCase();
        const indexName = path.basename(config.index || 'index.html').toLowerCase();
        const revalidate = name.endsWith('.html') || name.endsWith('.htm') || name === indexName;
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

    function staticFor(root) {
        let middleware = staticByRoot.get(root);
        if (middleware) return middleware;

        middleware = express.static(root, { index: config.index || 'index.html', setHeaders: setServMiddlewareHeaders, dotfiles: 'allow' });
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

    function zipDownload(req, res, next) {
        if (typeof req.query.paths !== 'string' || !req.query.paths) return next(new HttpError(400, 'missing paths'));

        let filePaths;
        try {
            filePaths = JSON.parse(req.query.paths);
        } catch {
            return next(new HttpError(400, 'invalid paths'));
        }

        if (!Array.isArray(filePaths) || !filePaths.length || !filePaths.every(function (p) { return typeof p === 'string'; })) return next(new HttpError(400, 'invalid paths'));
        if (filePaths.length > MAX_ZIP_PATHS) return next(new HttpError(400, 'too many paths'));

        let root;
        if (req.query.deployment != null && req.query.deployment !== '') {
            root = safe(function () { return sites.rootForQuery(req); });
            if (safe.error) return next(new HttpError(400, safe.error.message));
        } else {
            root = sites.resolveRequest(req).root;
        }
        const absolutePaths = [];
        for (const filePath of filePaths) {
            const absoluteFilePath = path.resolve(path.join(root, filePath));
            if (!sites.contains(root, absoluteFilePath)) return next(new HttpError(403, 'Path not allowed'));
            absolutePaths.push(absoluteFilePath);
        }

        const name = (typeof req.query.name === 'string' && req.query.name) ? req.query.name : 'download';

        zip.zipPaths(absolutePaths, name, res);
    }

    function install(app, handleProtection) {
        app.get('/build.json', function (req, res, next) {
            const buildFile = path.join(appRoot, 'dist', 'build.json');
            if (!fs.existsSync(buildFile)) return next();
            res.sendFile(buildFile);
        });

        app.use('/_admin', express.static(path.join(appRoot, 'dist'), { index: 'admin.html' }));
        app.use('/assets', express.static(path.join(appRoot, 'dist', 'assets')));
        app.use('/', handleProtection);
        app.use('/', function (req, res, next) {
            const root = sites.resolveRequest(req).root;
            if (!fs.existsSync(root)) return next();
            staticFor(root)(req, res, next);
        });
        app.use('/', function welcomePage(req, res, next) {
            if (config.folderListingEnabled || req.path !== '/') return next();
            res.status(200).sendFile(path.join(appRoot, 'dist', 'welcome.html'));
        });
        app.use('/', function (req, res, next) {
            if (!config.folderListingEnabled) return send404(req, res);

            const root = sites.resolveRequest(req).root;
            const filePath = req.path ? decodeURIComponent(req.path) : '';
            if (!fs.existsSync(path.join(root, filePath))) return send404(req, res);

            // we provision the public app with all the info so we can do static and dynamic rendering
            files.getFolderListing(root, filePath, function (error, result) {
                if (error) return next(error);

                // use cached PUBLIC_NOSCRIPT_EJS when deployed otherwise reread from disk for development
                let out = process.env.CLOUDRON ? publicHtml : fs.readFileSync(publicHtmlFile, 'utf8');
                out = out.replace('<noscript></noscript>', `<noscript>${ejs.render(publicNoscriptEjs, result, {})}</noscript>`);
                out = out.replace('<withscript></withscript>', `<script>window.surfer = { entries: ${JSON.stringify(result.entries)}, stat: ${JSON.stringify(result.stat)} };</script>`);

                res.status(200).send(out);
            });
        });
    }

    return { resetStatic, zipDownload, install };
}

export default createPublic;
