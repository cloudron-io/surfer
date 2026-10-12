#!/usr/bin/env node

'use strict';

import fs from 'fs';
import path from 'path';
import * as tegel from '@cloudron/tegel';
import { lastMile } from '@cloudron/connect-lastmile';
import auth from './src/auth.js';
import cors from './src/cors.js';
import database from './src/database.js';
import deploy from './src/deploy.js';
import domains from './src/domains.js';
import history from './src/history.js';
import mime from './src/mime.js';
import multipart from './src/multipart.js';
import routes from './src/routes/index.js';
import settings from './src/settings.js';
import sites from './src/sites.js';

const ROOT_FOLDER = sites.primaryRoot;
const DB_FILE = path.resolve(import.meta.dirname, process.argv[3] || 'db.sqlite');
const FAVICON_FILE = path.resolve(import.meta.dirname, process.argv[4] || 'favicon.png');
const FAVICON_FALLBACK_FILE = path.resolve(import.meta.dirname, 'dist', 'logo.png');

// A crashed deploy can leave the live folder renamed aside. Restore it before creating an empty one.
deploy.recover();

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });
sites.prepare();

console.log(`Using database at: ${DB_FILE}`);
await settings.init(DB_FILE, { faviconFile: FAVICON_FILE, faviconFallback: FAVICON_FALLBACK_FILE });
domains.init(sites.primaryName());
history.init();
settings.load();

const testMode = process.env.SURFER_ENV === 'test' ? { username: 'girish', name: 'Girish' } : null;
const oidcConfig = testMode ? null : (process.env.CLOUDRON ? {} : (process.env.OIDC_ISSUER_ORIGIN ? {
    issuer: process.env.OIDC_ISSUER_ORIGIN,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
} : null));

// skipLastMile: surfer has its own trailing static/routing handlers that must run before the error handler
const { app, router, express } = await tegel.createExpressApp({ oidcConfig, testMode, skipLastMile: true });

// Setup mime-type handling
mime(express);

const upload = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' });

function logRequests(req, res, next) {
    res.on('finish', function () {
        const status = res.statusCode;
        if (status < 200 || status >= 400) {
            console.warn(req.method + ' ' + (req.originalUrl || req.url) + ' ' + status);
        }
    });
    next();
}

function setReturnTo(req, res, next) {
    req.session.returnTo = req.query.returnTo || '/';
    next();
}

function oidcCallbackHandler(req, res) {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;

    return tegel.oidcCallback(returnTo, '/?error=auth_failed', async () => {})(req, res);
}

function healthcheck(req, res) {
    res.status(200).send();
}

router.use(logRequests);
router.use(cors({ origins: [ '*' ], allowCredentials: false }));
router.use('/api', express.urlencoded({ extended: false, limit: '100mb' }));

router.get   ('/auth/login', setReturnTo, tegel.oidcRedirectToLoginProvider);
router.get   ('/auth/callback', oidcCallbackHandler);
router.get   ('/auth/logout', tegel.logout('/'));

router.post  ('/api/protectedLogin', routes.access.protectedLogin);
router.get   ('/api/settings', routes.settings.get);
router.get   ('/api/favicon', routes.settings.getFavicon);
router.put   ('/api/favicon', auth.requireAuth, upload, routes.settings.putFavicon);
router.delete('/api/favicon', auth.requireAuth, routes.settings.deleteFavicon);
router.put   ('/api/settings', auth.requireAuth, routes.settings.put);
router.get   ('/api/profile', auth.requireAuth, routes.auth.getProfile);
router.get   ('/api/files/*path', auth.requireAuth, routes.files.get);
router.post  ('/api/files/*path', auth.requireAuth, upload, routes.files.post);
router.put   ('/api/files/*path', auth.requireAuth, routes.files.put);
router.delete('/api/files/*path', auth.requireAuth, routes.files.del);
router.post  ('/api/copy', auth.requireAuth, routes.files.copy);
router.post  ('/api/extract', auth.requireAuth, routes.extract.extract);
router.post  ('/api/deploy', auth.requireAuth, routes.deploy.publish);
router.get   ('/api/history', auth.requireAuth, routes.history.get);
router.get   ('/api/sites', auth.requireAuth, routes.sites.list);
router.post  ('/api/sites', auth.requireAuth, routes.sites.create);
router.put   ('/api/sites/:domain', auth.requireAuth, routes.sites.update);
router.delete('/api/sites/:domain', auth.requireAuth, routes.sites.remove);
router.post  ('/api/sites/:name/default', auth.requireAuth, routes.deploy.promote);
// Public folder listing zip. A deployment query, or listing turned off, is an admin download.
router.get   ('/api/zip', routes.publicSite.allowZip, routes.publicSite.zipDownload);
router.get   ('/api/zip', auth.requireAuth, routes.files.zipDownload);
router.get   ('/api/healthcheck', healthcheck);

routes.webdav.install(app);
routes.publicSite.install(app, express);
app.use(lastMile());

const port = process.env.SURFER_ENV === 'test' && process.env.PORT ? Number(process.env.PORT) : 3000;
const server = app.listen(port, function () {
    const actual = this.address().port;
    console.log(`Base path: ${ROOT_FOLDER}`);
    const aliases = sites.aliasPatterns();
    if (aliases.length) console.log(`Alias domains: ${aliases.join(', ')}`);
    console.log();
    console.log(`Listening on http://localhost:${actual}`);
});

tegel.gracefulShutdown({ server, close: function () { database.close(); } });
