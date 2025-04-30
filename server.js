#!/usr/bin/env node

'use strict';

import express from 'express';
import morgan from 'morgan';
import path from 'path';
import session from 'express-session';
import ejs from 'ejs';
import fs from 'fs';
import crypto from 'crypto';
import cors from './src/cors.js';
import compression from 'compression';
import contentDisposition from 'content-disposition';
import lastMile from 'connect-lastmile';
import { HttpError, HttpSuccess } from 'connect-lastmile';
import multipart from './src/multipart.js';
import auth from './src/auth.js';
import mime from './src/mime.js';
import webdav from 'webdav-server';
import files from './src/files.js';

const ROOT_FOLDER = path.resolve(import.meta.dirname, process.argv[2] || 'files');
const CONFIG_FILE = path.resolve(import.meta.dirname, process.argv[3] || '.config.json');
const FAVICON_FILE = path.resolve(import.meta.dirname, process.argv[4] || 'favicon.png');
const FAVICON_FALLBACK_FILE = path.resolve(import.meta.dirname, 'dist', 'logo.png');

const PASSWORD_PLACEHOLDER = '__PLACEHOLDER__';

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

// session is only used for passwort protection state
const sessionStore = new session.MemoryStore();

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });

// Load the config file
let config = {};

try {
    console.log(`Using config file at: ${CONFIG_FILE}`);
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (e) {
    if (e.code === 'ENOENT') console.log(`Config file ${CONFIG_FILE} not found`);
    else console.log(`Cannot load config file ${CONFIG_FILE}`, e);
}

if (typeof config.folderListingEnabled !== 'boolean') config.folderListingEnabled = false;
if (typeof config.sortFoldersFirst !== 'boolean') config.sortFoldersFirst = true;
if (typeof config.title !== 'string') config.title = 'Surfer';
if (typeof config.accessRestriction !== 'string') config.accessRestriction = '';
if (typeof config.accessPassword !== 'string') config.accessPassword = '';
if (typeof config.index !== 'string') config.index = '';

function setServMiddlewareHeaders (res, path) {
    // handle ?download in query
    if ('download' in res.req.query) res.setHeader('Content-Disposition', contentDisposition(path));
}

// we will regenerate this if settings change
let staticServMiddleware = express.static(ROOT_FOLDER, { index: config.index || 'index.html', setHeaders: setServMiddlewareHeaders });

function getSettings(req, res) {
    res.send({
        folderListingEnabled: !!config.folderListingEnabled,
        sortFoldersFirst: !!config.sortFoldersFirst,
        title: config.title || 'Surfer',
        index: config.index || '',
        accessRestriction: config.accessRestriction || '',
        accessPassword: config.accessPassword ? PASSWORD_PLACEHOLDER : '' // don't send the password, helps the UI to figure if a password was set at all
    });
}

function setSettings(req, res, next) {
    if (typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
    if (typeof req.body.sortFoldersFirst !== 'boolean') return next(new HttpError(400, 'missing sortFoldersFirst boolean'));
    if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
    if (req.body.index && typeof req.body.index !== 'string') return next(new HttpError(400, 'index must be falsy or a string'));
    if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));
    if ('accessPassword' in req.body && typeof req.body.accessPassword !== 'string') return next(new HttpError(400, 'accessPassword must be a string'));

    function clearPasswordProtectionSessions(callback) {
        callback = callback || function () {};

        sessionStore.clear(function (error) {
            if (error) console.error('Failed to clear sessions.', error);
            callback();
        });
    }

    function updatePasswordIfNeeded(callback) {
        if (!('accessPassword' in req.body) || req.body.accessPassword === PASSWORD_PLACEHOLDER) return callback();

        crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
            if (error) return callback(error);

            crypto.pbkdf2(req.body.accessPassword, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
                if (error) return callback(error);

                config.accessPassword = Buffer.from(derivedKey, 'binary').toString('hex');
                config.accessPasswordSalt = salt.toString('hex');

                clearPasswordProtectionSessions(callback);
            });
        });
    }

    config.folderListingEnabled = !!req.body.folderListingEnabled;
    config.sortFoldersFirst = !!req.body.sortFoldersFirst;
    config.title = req.body.title;
    config.index = req.body.index;

    staticServMiddleware = express.static(ROOT_FOLDER, { index: config.index || 'index.html', setHeaders: setServMiddlewareHeaders });

    // if changed invalidate sessions
    if (config.accessRestriction !== req.body.accessRestriction) clearPasswordProtectionSessions();

    config.accessRestriction = req.body.accessRestriction;

    updatePasswordIfNeeded(function (error) {
        if (error) return next(new HttpError(500, 'failed to set password'));

        fs.writeFile(CONFIG_FILE, JSON.stringify(config), function (error) {
            if (error) return next(new HttpError(500, 'unable to save settings'));

            next(new HttpSuccess(201, {}));
        });
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
    if (!config.accessRestriction) return next();   // no protection
    if (req.session.isValid) return next();         // password protection
    if (req.oidc.isAuthenticated()) return next();  // openid user protection

    res.status(401).sendFile(path.join(import.meta.dirname, '/dist/protected.html'));
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

            req.session.isValid = true;

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

// Setup mime-type handling
mime(express);

// Setup the express server and routes
const app = express();
const router = new express.Router();

// needed for secure cookies
app.enable('trust proxy');

const webdavServer = new webdav.v2.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.v2.HTTPBasicAuthentication(new auth.WebdavUserManager(), 'Cloudron Surfer')
});

webdavServer.setFileSystem('/', new webdav.v2.PhysicalFileSystem(ROOT_FOLDER), function (success) {
    if (!success) console.error('Failed to setup webdav server!');
});

const PUBLIC_HTML = fs.readFileSync(import.meta.dirname + '/dist/public.html', 'utf8');
const PUBLIC_NOSCRIPT_EJS = fs.readFileSync(import.meta.dirname + '/src/public.noscript.ejs', 'utf8');

router.post  ('/api/protectedLogin', protectedLogin);
router.get   ('/api/oidc/login', auth.oidcLogin);
router.get   ('/api/settings', getSettings);
router.get   ('/api/favicon', getFavicon);
router.put   ('/api/favicon', auth.verifyToken, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), setFavicon);
router.delete('/api/favicon', auth.verifyToken, resetFavicon);
router.put   ('/api/settings', auth.verifyToken, setSettings);
router.get   ('/api/token', auth.oidcAuth, auth.createOidcToken);
router.get   ('/api/tokens', auth.verifyToken, auth.getTokens);
router.post  ('/api/tokens', auth.verifyToken, auth.createToken);
router.delete('/api/tokens/:token', auth.verifyToken, auth.delToken);
router.get   ('/api/profile', auth.verifyToken, auth.getProfile);
router.get   ('/api/files/*path', auth.verifyToken, files.get);
router.post  ('/api/files/*path', auth.verifyToken, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), files.post);
router.put   ('/api/files/*path', auth.verifyToken, files.put);
router.delete('/api/files/*path', auth.verifyToken, files.del);

app.use('/api/healthcheck', function (req, res) { res.status(200).send(); });
app.use(morgan('dev'));
app.use(compression());
app.use(cors({ origins: [ '*' ], allowCredentials: false }));
app.use('/api', express.json());
app.use('/api', express.urlencoded({ extended: false, limit: '100mb' }));
app.use(session({ store: sessionStore, secret: 'surfin surfin', resave: false, saveUninitialized: true, cookie: { secure: !!process.env.CLOUDRON, sameSite: 'strict' } }));
app.use(auth.oidcMiddleware);
app.use(router);
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
        let out = process.env.CLOUDRON ? PUBLIC_HTML : fs.readFileSync(import.meta.dirname + '/dist/public.html', 'utf8');;
        out = out.replace('<noscript></noscript>', `<noscript>${ejs.render(PUBLIC_NOSCRIPT_EJS, result, {})}</noscript>`);
        out = out.replace('<withscript></withscript>', `<script>window.surfer = { entries: ${JSON.stringify(result.entries)}, stat: ${JSON.stringify(result.stat)} };</script>`);

        res.status(200).send(out);
    });
});
app.use(lastMile());

const server = app.listen(3000, function () {
    const host = server.address().address;
    const port = server.address().port;

    console.log(`Base path: ${ROOT_FOLDER}`);
    console.log();
    console.log(`Listening on http://${host}:${port}`);
});
