#!/usr/bin/env node

'use strict';

var express = require('express'),
    async = require('async'),
    morgan = require('morgan'),
    path = require('path'),
    session = require('express-session'),
    ejs = require('ejs'),
    fs = require('fs'),
    crypto = require('crypto'),
    cors = require('./src/cors.js'),
    copyFile = require('./src/copyFile.js'),
    compression = require('compression'),
    bodyParser = require('body-parser'),
    lastMile = require('connect-lastmile'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    multipart = require('./src/multipart'),
    auth = require('./src/auth.js'),
    webdav = require('webdav-server').v2,
    files = require('./src/files.js')(path.resolve(__dirname, process.argv[2] || 'files'));

const ROOT_FOLDER = path.resolve(__dirname, process.argv[2] || 'files');
const CONFIG_FILE = path.resolve(__dirname, process.argv[3] || '.config.json');
const FAVICON_FILE = path.resolve(__dirname, process.argv[4] || 'favicon.png');
const FAVICON_FALLBACK_FILE = path.resolve(__dirname, 'dist', 'logo.png');

const PASSWORD_PLACEHOLDER = '__PLACEHOLDER__';

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

var sessionStore = new session.MemoryStore();

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });

var config = {
    folderListingEnabled: false,
    sortFoldersFirst: true,
    title: '',
    accessRestriction: '',
    accessPassword: ''
};

function getSettings(req, res) {
    res.send({
        folderListingEnabled: !!config.folderListingEnabled,
        sortFoldersFirst: !!config.sortFoldersFirst,
        title: config.title || 'Surfer',
        accessRestriction: config.accessRestriction || '',
        accessPassword: config.accessPassword ? PASSWORD_PLACEHOLDER : '' // don't send the password, helps the UI to figure if a password was set at all
    });
}

function setSettings(req, res, next) {
    if (typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
    if (typeof req.body.sortFoldersFirst !== 'boolean') return next(new HttpError(400, 'missing sortFoldersFirst boolean'));
    if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
    if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));
    if ('accessPassword' in req.body && typeof req.body.accessPassword !== 'string') return next(new HttpError(400, 'accessPassword must be a string'));

    function clearNonAdminSessions(callback) {
        callback = callback || function () {};

        sessionStore.all(function (error, sessions) {
            if (error) return console.error('Failed to get sessions.', error);

            async.each(Object.keys(sessions), function (sid, callback) {
                if (sessions[sid].isAdmin) return callback();

                sessionStore.destroy(sid, function (error) {
                    if (error) console.error(`Failed to delete session %sid.`, error);
                    callback();
                });
            }, callback);
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

                clearNonAdminSessions(callback);
            });
        });
    }

    config.folderListingEnabled = !!req.body.folderListingEnabled;
    config.sortFoldersFirst = !!req.body.sortFoldersFirst;
    config.title = req.body.title;

    // if changed invalidate sessions
    if (config.accessRestriction !== req.body.accessRestriction) clearNonAdminSessions();

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

    copyFile(req.files.file.path, FAVICON_FILE, function (error) {
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
    if (!config.accessRestriction) return next();
    if (req.session.isValid) return next();

    res.status(200).sendFile(path.join(__dirname, '/dist/protected.html'));
}

function protectedLogin(req, res, next) {
    function success() {
        req.session.isValid = true;
        next(new HttpSuccess(200, {}));
    }

    if (config.accessRestriction === 'password') {
        let saltBinary = Buffer.from(config.accessPasswordSalt, 'hex');
        crypto.pbkdf2(req.body.password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
            if (error) {
                console.log('Failed to derive key.', error);
                return next(new HttpError(500, 'internal error'));
            }

            let derivedKeyHex = Buffer.from(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== config.accessPassword) return next(new HttpError(403, 'forbidden'));

            success();
        });
    } else if (config.accessRestriction === 'user') {
        auth.verifyUser(req.body.username, req.body.password, function (error) {
            if (error) return next(new HttpError(401, 'Invalid credentials'));
            success();
        });
    } else {
        next(new HttpError(409, 'site is not protected'));
    }
}

function send404(res) {
    // first check if /404.htm(l) exists, if so send that
    if (fs.existsSync(path.join(ROOT_FOLDER, '404.html'))) return res.status(404).sendFile(path.join(ROOT_FOLDER, '404.html'));
    if (fs.existsSync(path.join(ROOT_FOLDER, '404.htm' ))) return res.status(404).sendFile(path.join(ROOT_FOLDER, '404.htm'));

    res.status(404).sendFile(__dirname + '/dist/404.html');
}

// Load the config file
try {
    console.log(`Using config file at: ${CONFIG_FILE}`);
    config = require(CONFIG_FILE);
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') console.log(`Config file ${CONFIG_FILE} not found`);
    else console.log(`Cannot load config file ${CONFIG_FILE}`, e);
}

if (typeof config.folderListingEnabled !== 'boolean') config.folderListingEnabled = false;
if (typeof config.sortFoldersFirst !== 'boolean') config.sortFoldersFirst = true;
if (typeof config.title !== 'string') config.title = 'Surfer';
if (typeof config.accessRestriction !== 'string') config.accessRestriction = '';
if (typeof config.accessPassword !== 'string') config.accessPassword = '';

// Setup the express server and routes
var app = express();
var router = new express.Router();

var webdavServer = new webdav.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(new auth.WebdavUserManager(), 'Cloudron Surfer')
});

webdavServer.setFileSystem('/', new webdav.PhysicalFileSystem(ROOT_FOLDER), function (success) {
    if (!success) console.error('Failed to setup webdav server!');
});

const PUBLIC_HTML = fs.readFileSync(__dirname + '/dist/public.html', 'utf8');
const PUBLIC_NOSCRIPT_EJS = fs.readFileSync(__dirname + '/frontend/public.noscript.ejs', 'utf8');

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.post  ('/api/protectedLogin', protectedLogin);
router.post  ('/api/login', auth.login);
router.post  ('/api/logout', auth.verify, auth.logout);
router.get   ('/api/settings', getSettings);
router.get   ('/api/favicon', getFavicon);
router.put   ('/api/favicon', auth.verify, multipart, setFavicon);
router.delete('/api/favicon', auth.verify, resetFavicon);
router.put   ('/api/settings', auth.verify, setSettings);
router.get   ('/api/tokens', auth.verify, auth.getTokens);
router.post  ('/api/tokens', auth.verify, auth.createToken);
router.delete('/api/tokens/:token', auth.verify, auth.delToken);
router.get   ('/api/profile', auth.verify, auth.getProfile);
router.get   ('/api/files/*', files.get);
router.post  ('/api/files/*', auth.verify, multipart, files.post);
router.put   ('/api/files/*', auth.verify, files.put);
router.delete('/api/files/*', auth.verify, files.del);

app.use('/api/healthcheck', function (req, res) { res.status(200).send(); });
app.use(morgan('dev'));
app.use(compression());
app.use(cors({ origins: [ '*' ], allowCredentials: false }));
app.use('/api', bodyParser.json());
app.use('/api', bodyParser.urlencoded({ extended: false, limit: '100mb' }));
app.use(session({ store: sessionStore, secret: 'surfin surfin', resave: false, saveUninitialized: true, cookie: {} }));
app.use(router);
app.use(webdav.extensions.express('/_webdav', webdavServer));
app.use('/_admin', express.static(__dirname + '/dist'));
app.use('/', handleProtection);
app.use('/', express.static(ROOT_FOLDER));
app.use('/', function welcomePage(req, res, next) {
    if (config.folderListingEnabled || req.path !== '/') return next();
    res.status(200).sendFile(path.join(__dirname, '/dist/welcome.html'));
});
app.use('/', function (req, res, next) {
    if (!config.folderListingEnabled) return send404(res);
    if (!fs.existsSync(path.join(ROOT_FOLDER, decodeURIComponent(req.path)))) return send404(res);

    // we provision the public app with all the info so we can do static and dynamic rendering
    files.getFolderListing(decodeURIComponent(req.path), function (error, result) {
        if (error) return next(error);

        var html = ejs.render(PUBLIC_NOSCRIPT_EJS, result, {});

        var out = PUBLIC_HTML;
        out = out.replace('<noscript></noscript>', `<noscript>${html}</noscript>`);
        out = out.replace('<withscript></withscript>', `<script>window.surfer = { entries: ${JSON.stringify(result.entries)}, stat: ${JSON.stringify(result.stat)} };</script>`);

        res.status(200).send(out);
    });
});
app.use(lastMile());

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log(`Base path: ${ROOT_FOLDER}`);
    console.log();
    console.log(`Listening on http://${host}:${port}`);

    auth.init(config);
});
