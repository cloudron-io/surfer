#!/usr/bin/env node

'use strict';

import path from 'path';
import ejs from 'ejs';
import fs from 'fs';
import crypto from 'crypto';
import safe from '@cloudron/safetydance';
import * as tegel from '@cloudron/tegel';
import cors from './src/cors.js';
import { create as createContentDisposition } from 'content-disposition';
import { lastMile, HttpError, HttpSuccess } from '@cloudron/connect-lastmile';
import multipart from './src/multipart.js';
import auth from './src/auth.js';
import mime from './src/mime.js';
import webdav from 'webdav-server';
import files from './src/files.js';
import zip from './src/zip.js';
import extract from './src/extract.js';
import deploy from './src/deploy.js';
import settings from './src/settings.js';
import deploys from './src/deploys.js';

const ROOT_FOLDER = path.resolve(import.meta.dirname, process.argv[2] || 'files');
const DB_FILE = path.resolve(import.meta.dirname, process.argv[3] || 'db.sqlite');
const FAVICON_FILE = path.resolve(import.meta.dirname, process.argv[4] || 'favicon.png');
const FAVICON_FALLBACK_FILE = path.resolve(import.meta.dirname, 'dist', 'logo.png');

const PASSWORD_PLACEHOLDER = '__PLACEHOLDER__';
const PASSWORD_COOKIE = 'surfer.auth';

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

// A crashed deploy can leave the live folder renamed aside. Restore it before creating an empty one.
deploy.recover();

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });

console.log(`Using database at: ${DB_FILE}`);
settings.init(DB_FILE);
deploys.init();
const config = settings.load();

const ASSET_MAX_AGE = 3600;

function cacheControlFor(filePath) {
    const name = path.basename(filePath).toLowerCase();
    const indexName = path.basename(config.index || 'index.html').toLowerCase();
    const revalidate = name.endsWith('.html') || name.endsWith('.htm') || name === indexName;
    const visibility = config.accessRestriction ? 'private' : 'public';

    return visibility + ', max-age=' + (revalidate ? 0 : ASSET_MAX_AGE);
}

function setServMiddlewareHeaders (res, filePath) {
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

function getCookie(req, name) {
    const header = req.headers.cookie || '';
    const parts = header.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
    }
    return null;
}

function passwordAuthToken() {
    // key = config.accessPassword (secret PBKDF2-derived key); message = the salt. both rotate on password change
    return crypto.createHmac('sha256', config.accessPassword).update(config.accessPasswordSalt).digest('hex');
}

function isPasswordAuthCookie(req) {
    const value = getCookie(req, PASSWORD_COOKIE);
    if (!value) return false;

    const a = Buffer.from(value, 'hex');
    const b = Buffer.from(passwordAuthToken(), 'hex');

    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const oidcConfig = process.env.CLOUDRON ? {} : (process.env.OIDC_ISSUER_ORIGIN ? {
    issuer: process.env.OIDC_ISSUER_ORIGIN,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
} : null);

// skipLastMile: surfer has its own trailing static/routing handlers that must run before the error handler
const { app, router, express } = await tegel.createExpressApp({ oidcConfig, skipLastMile: true });

// Setup mime-type handling
mime(express);

// we will regenerate this if settings change
let staticServMiddleware = express.static(ROOT_FOLDER, { index: config.index || 'index.html', setHeaders: setServMiddlewareHeaders, dotfiles: 'allow' });

const webdavServer = new webdav.v2.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.v2.HTTPBasicAuthentication(new auth.WebdavUserManager(), 'Cloudron Surfer')
});

webdavServer.setFileSystem('/', new webdav.v2.PhysicalFileSystem(ROOT_FOLDER), function (success) {
    if (!success) console.error('Failed to setup webdav server!');
});

const PUBLIC_HTML = fs.readFileSync(import.meta.dirname + '/dist/public.html', 'utf8');
const PUBLIC_NOSCRIPT_EJS = fs.readFileSync(import.meta.dirname + '/src/public.noscript.ejs', 'utf8');

function webadminOrigin() {
    if (process.env.CLOUDRON_WEBADMIN_ORIGIN) return process.env.CLOUDRON_WEBADMIN_ORIGIN.replace(/\/$/, '');

    // Local development has no platform env. The OIDC issuer is the dashboard origin plus /openid.
    const issuer = process.env.OIDC_ISSUER_ORIGIN || '';
    if (!issuer) return '';

    try {
        return new URL(issuer).origin;
    } catch {
        return '';
    }
}

function getSettings(req, res) {
    const origin = webadminOrigin();

    res.send({
        folderListingEnabled: !!config.folderListingEnabled,
        title: config.title || 'Surfer',
        index: config.index || '',
        accessRestriction: config.accessRestriction || '',
        accessPassword: config.accessPassword ? PASSWORD_PLACEHOLDER : '', // don't send the password, helps the UI to figure if a password was set at all
        oidcProviderName: process.env.CLOUDRON_OIDC_PROVIDER_NAME || 'Cloudron',
        appPasswordsUrl: origin ? `${origin}/#/profile` : ''
    });
}

function setSettings(req, res, next) {
    if (typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
    if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
    if (req.body.index && typeof req.body.index !== 'string') return next(new HttpError(400, 'index must be falsy or a string'));
    if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));
    if ('accessPassword' in req.body && typeof req.body.accessPassword !== 'string') return next(new HttpError(400, 'accessPassword must be a string'));

    function updatePasswordIfNeeded(callback) {
        if (!('accessPassword' in req.body) || req.body.accessPassword === PASSWORD_PLACEHOLDER) return callback();

        crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
            if (error) return callback(error);

            crypto.pbkdf2(req.body.accessPassword, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
                if (error) return callback(error);

                config.accessPassword = Buffer.from(derivedKey, 'binary').toString('hex');
                config.accessPasswordSalt = salt.toString('hex');

                callback();
            });
        });
    }

    config.folderListingEnabled = !!req.body.folderListingEnabled;
    config.title = req.body.title;
    config.index = req.body.index;

    staticServMiddleware = express.static(ROOT_FOLDER, { index: config.index || 'index.html', setHeaders: setServMiddlewareHeaders, dotfiles: 'allow' });

    config.accessRestriction = req.body.accessRestriction;

    updatePasswordIfNeeded(function (error) {
        if (error) return next(new HttpError(500, 'failed to set password'));

        safe(function () { settings.save(config); });
        if (safe.error) {
            console.error('unable to save settings', safe.error);
            return next(new HttpError(500, 'unable to save settings'));
        }

        next(new HttpSuccess(201, {}));
    });
}

function getFavicon(req, res) {
    if (fs.existsSync(FAVICON_FILE)) res.sendFile(FAVICON_FILE);
    else res.sendFile(FAVICON_FALLBACK_FILE);
}

function setFavicon(req, res, next) {
    if (!req.files || !req.files.file) return next(new HttpError(400, 'missing file'));

    fs.copyFile(req.files.file.path, FAVICON_FILE, function (error) {
        if (error) {
            console.error('Failed to save favicon.', error);
            return next(new HttpError(500, 'Failed to save favicon'));
        }

        next(new HttpSuccess(201, {}));
    });
}

function resetFavicon(req, res, next) {
    fs.unlink(FAVICON_FILE, function (error) {
        if (error) {
            console.error('Failed to reset favicon.', error);
            return next(new HttpError(500, 'Failed to reset favicon'));
        }

        next(new HttpSuccess(201, {}));
    });
}

function handleProtection(req, res, next) {
    if (!config.accessRestriction) return next();                        // no protection
    if (config.accessRestriction === 'password' && isPasswordAuthCookie(req)) return next(); // password protection
    if (config.accessRestriction === 'user' && req.session.user) return next();               // openid user protection

    res.status(401).sendFile(path.join(import.meta.dirname, '/dist/protected.html'));
}

const MAX_ZIP_PATHS = 100;

function handleZipDownload(req, res, next) {
    if (typeof req.query.paths !== 'string' || !req.query.paths) return next(new HttpError(400, 'missing paths'));

    let filePaths;
    try {
        filePaths = JSON.parse(req.query.paths);
    } catch {
        return next(new HttpError(400, 'invalid paths'));
    }

    if (!Array.isArray(filePaths) || !filePaths.length || !filePaths.every(function (p) { return typeof p === 'string'; })) return next(new HttpError(400, 'invalid paths'));
    if (filePaths.length > MAX_ZIP_PATHS) return next(new HttpError(400, 'too many paths'));

    const absolutePaths = [];
    for (const filePath of filePaths) {
        const absoluteFilePath = path.resolve(path.join(ROOT_FOLDER, filePath));
        if (absoluteFilePath !== ROOT_FOLDER && absoluteFilePath.indexOf(ROOT_FOLDER + path.sep) !== 0) return next(new HttpError(403, 'Path not allowed'));
        absolutePaths.push(absoluteFilePath);
    }

    const name = (typeof req.query.name === 'string' && req.query.name) ? req.query.name : 'download';

    zip.zipPaths(absolutePaths, name, res);
}

function protectedLogin(req, res, next) {
    if (config.accessRestriction === 'password') {
        const saltBinary = Buffer.from(config.accessPasswordSalt, 'hex');
        crypto.pbkdf2(req.body.password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
            if (error) {
                console.log('Failed to derive key.', error);
                return next(new HttpError(500, 'internal error'));
            }

            const derivedKeyHex = Buffer.from(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== config.accessPassword) return next(new HttpError(403, 'forbidden'));

            res.cookie(PASSWORD_COOKIE, passwordAuthToken(), {
                httpOnly: true,
                secure: !!process.env.CLOUDRON || process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });

            next(new HttpSuccess(200, {}));
        });
    } else {
        next(new HttpError(409, 'site is not protected'));
    }
}

function send404(res) {
    // first check if /404.htm(l) exists, if so send that
    if (fs.existsSync(path.join(ROOT_FOLDER, '404.html'))) return res.status(404).sendFile(path.join(ROOT_FOLDER, '404.html'));
    if (fs.existsSync(path.join(ROOT_FOLDER, '404.htm' ))) return res.status(404).sendFile(path.join(ROOT_FOLDER, '404.htm'));

    res.status(404).sendFile(import.meta.dirname + '/dist/404.html');
}

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

router.use(logRequests);
router.use(cors({ origins: [ '*' ], allowCredentials: false }));
router.use('/api', express.urlencoded({ extended: false, limit: '100mb' }));

router.get   ('/auth/login', setReturnTo, tegel.oidcRedirectToLoginProvider);
router.get   ('/auth/callback', oidcCallbackHandler);
router.get   ('/auth/logout', tegel.logout('/'));

router.post  ('/api/protectedLogin', protectedLogin);
router.get   ('/api/settings', getSettings);
router.get   ('/api/favicon', getFavicon);
router.put   ('/api/favicon', auth.requireAuth, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), setFavicon);
router.delete('/api/favicon', auth.requireAuth, resetFavicon);
router.put   ('/api/settings', auth.requireAuth, setSettings);
router.get   ('/api/profile', auth.requireAuth, auth.getProfile);
router.get   ('/api/files/*path', auth.requireAuth, files.get);
router.post  ('/api/files/*path', auth.requireAuth, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), files.post);
router.put   ('/api/files/*path', auth.requireAuth, files.put);
router.delete('/api/files/*path', auth.requireAuth, files.del);
router.post  ('/api/copy', auth.requireAuth, files.copy);
router.post  ('/api/extract', auth.requireAuth, extract.extract);
router.post  ('/api/deploy', auth.requireAuth, deploy.deploy);
router.get   ('/api/deploys', auth.requireAuth, deploys.get);
router.get   ('/api/zip', handleProtection, handleZipDownload);
router.get   ('/api/healthcheck', function (req, res) { res.status(200).send(); });

app.get('/build.json', function (req, res, next) {
    const buildFile = path.join(import.meta.dirname, 'dist', 'build.json');
    if (!fs.existsSync(buildFile)) return next();
    res.sendFile(buildFile);
});

app.use(webdav.v2.extensions.express('/_webdav', webdavServer));
app.use('/_admin', express.static(import.meta.dirname + '/dist', { index: 'admin.html' }));
app.use('/assets', express.static(import.meta.dirname + '/dist/assets'));
app.use('/', handleProtection);
app.use('/', function (req, res, next) { staticServMiddleware(req, res, next); });
app.use('/', function welcomePage(req, res, next) {
    if (config.folderListingEnabled || req.path !== '/') return next();
    res.status(200).sendFile(path.join(import.meta.dirname, '/dist/welcome.html'));
});
app.use('/', function (req, res, next) {
    if (!config.folderListingEnabled) return send404(res);

    const filePath = req.path ? decodeURIComponent(req.path) : '';
    if (!fs.existsSync(path.join(ROOT_FOLDER, filePath))) return send404(res);

    // we provision the public app with all the info so we can do static and dynamic rendering
    files.getFolderListing(filePath, function (error, result) {
        if (error) return next(error);

        // use cached PUBLIC_NOSCRIPT_EJS when deployed otherwise reread from disk for development
        let out = process.env.CLOUDRON ? PUBLIC_HTML : fs.readFileSync(import.meta.dirname + '/dist/public.html', 'utf8');
        out = out.replace('<noscript></noscript>', `<noscript>${ejs.render(PUBLIC_NOSCRIPT_EJS, result, {})}</noscript>`);
        out = out.replace('<withscript></withscript>', `<script>window.surfer = { entries: ${JSON.stringify(result.entries)}, stat: ${JSON.stringify(result.stat)} };</script>`);

        res.status(200).send(out);
    });
});
app.use(lastMile());

app.listen(3000, function () {
    console.log(`Base path: ${ROOT_FOLDER}`);
    console.log();
    console.log('Listening on http://localhost:3000');
});
