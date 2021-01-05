#!/usr/bin/env node

'use strict';

var express = require('express'),
    morgan = require('morgan'),
    path = require('path'),
    fs = require('fs'),
    cors = require('./src/cors.js'),
    copyFile = require('./src/copyFile.js'),
    compression = require('compression'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
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

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });

var config = {
    folderListingEnabled: false,
    sortFoldersFirst: true,
    title: ''
};

function getSettings(req, res) {
    res.send({
        folderListingEnabled: !!config.folderListingEnabled,
        sortFoldersFirst: !!config.sortFoldersFirst,
        title: config.title || 'Surfer',
        accessRestriction: config.accessRestriction || ''
    });
}

function setSettings(req, res, next) {
    if (typeof req.body.folderListingEnabled !== 'boolean') return next(new HttpError(400, 'missing folderListingEnabled boolean'));
    if (typeof req.body.sortFoldersFirst !== 'boolean') return next(new HttpError(400, 'missing sortFoldersFirst boolean'));
    if (typeof req.body.title !== 'string') return next(new HttpError(400, 'missing title string'));
    if (typeof req.body.accessRestriction !== 'string') return next(new HttpError(400, 'missing accessRestriction string'));

    config.folderListingEnabled = !!req.body.folderListingEnabled;
    config.sortFoldersFirst = !!req.body.sortFoldersFirst;
    config.title = req.body.title;
    config.accessRestriction = req.body.accessRestriction;

    fs.writeFile(CONFIG_FILE, JSON.stringify(config), function (error) {
        if (error) return next(new HttpError(500, 'unable to save settings'));

        next(new HttpSuccess(201, {}));
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

// Setup the express server and routes
var app = express();
var router = new express.Router();

var webdavServer = new webdav.WebDAVServer({
    requireAuthentification: true,
    httpAuthentication: new webdav.HTTPBasicAuthentication(new auth.WebdavUserManager(), 'Cloudron Surfer')
});

webdavServer.setFileSystem('/', new webdav.PhysicalFileSystem(ROOT_FOLDER), function (success) {
    if (success) console.log(`Mounting webdav resource from: ${ROOT_FOLDER}`);
});

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.post  ('/api/login', auth.login);
router.post  ('/api/logout', auth.verify, auth.logout);
router.get   ('/api/settings', auth.verifyIfNeeded, getSettings);
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
app.use('/api', cookieParser());
app.use(router);
app.use(webdav.extensions.express('/_webdav', webdavServer));
app.use('/_admin', express.static(__dirname + '/dist'));
app.use('/', express.static(ROOT_FOLDER));
app.use('/', function welcomePage(req, res, next) {
    if (config.folderListingEnabled || req.path !== '/') return next();
    res.status(200).sendFile(path.join(__dirname, '/dist/welcome.html'));
});
app.use('/', function (req, res) {
    if (!config.folderListingEnabled) return res.status(404).sendFile(__dirname + '/dist/404.html');

    if (!fs.existsSync(path.join(ROOT_FOLDER, decodeURIComponent(req.path)))) return res.status(404).sendFile(__dirname + '/dist/404.html');

    res.status(200).sendFile(__dirname + '/dist/public.html');
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
