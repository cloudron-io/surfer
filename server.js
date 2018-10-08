#!/usr/bin/env node

'use strict';


var express = require('express'),
    morgan = require('morgan'),
    passport = require('passport'),
    path = require('path'),
    fs = require('fs'),
    compression = require('compression'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    lastMile = require('connect-lastmile'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    multipart = require('./src/multipart'),
    mkdirp = require('mkdirp'),
    auth = require('./src/auth.js'),
    serveIndex = require('serve-index'),
    files = require('./src/files.js')(path.resolve(__dirname, process.argv[2] || 'files'));


const ROOT_FOLDER = path.resolve(__dirname, process.argv[2] || 'files');
const CONFIG_FILE = path.resolve(__dirname, process.argv[3] || '.config.json');

// Ensure the root folder exists
mkdirp.sync(ROOT_FOLDER);

var config = {
    folderListingEnabled: false
};

function getSettings(req, res, next) {
    res.send({ folderListingEnabled: !!config.folderListingEnabled });
}

function setSettings(req, res, next) {
    if (typeof req.body.folderListingEnabled === 'undefined') return next(new HttpError(400, 'missing folderListingEnabled boolean'));

    config.folderListingEnabled = !!req.body.folderListingEnabled;

    fs.writeFile(CONFIG_FILE, JSON.stringify(config), function (error) {
        if (error) return next(new HttpError(500, 'unable to save settings'));

        next(new HttpSuccess(201, {}));
    });
}

// Load the config file
try {
    console.log(`Using config file: ${CONFIG_FILE}`);
    config = require(CONFIG_FILE);
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') console.log(`Config file ${CONFIG_FILE} not found`);
    else console.log(`Cannot load config file ${CONFIG_FILE}`, e);
}

if (typeof config.folderListingEnabled === 'undefined') config.folderListingEnabled = true;

// Setup the express server and routes
var app = express();
var router = new express.Router();

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.post  ('/api/login', auth.login);
router.post  ('/api/logout', auth.verify, auth.logout);
router.get   ('/api/settings', auth.verify, getSettings);
router.put   ('/api/settings', auth.verify, setSettings);
router.get   ('/api/profile', auth.verify, auth.getProfile);
router.get   ('/api/files/*', auth.verify, files.get);
router.post  ('/api/files/*', auth.verify, multipart, files.post);
router.put   ('/api/files/*', auth.verify, files.put);
router.delete('/api/files/*', auth.verify, files.del);
router.get   ('/api/healthcheck', function (req, res) { res.status(200).send(); });

app.use(morgan('dev'));
app.use(compression());
app.use('/api', bodyParser.json());
app.use('/api', bodyParser.urlencoded({ extended: false, limit: '100mb' }));
app.use('/api', cookieParser());
app.use('/api', session({ secret: 'surfin surfin', resave: false, saveUninitialized: false }));
app.use('/api', passport.initialize());
app.use('/api', passport.session());
app.use(router);
app.use('/_admin', express.static(__dirname + '/frontend'));
app.use('/', express.static(ROOT_FOLDER));
app.use('/', function welcomePage(req, res, next) {
    if (config.folderListingEnabled || req.path !== '/') return next();
    res.status(200).sendFile(path.join(__dirname, '/frontend/welcome.html'));
});
app.use('/', function (req, res, next) {
    if (config.folderListingEnabled) return next();
    res.sendFile(__dirname + '/frontend/404.html');
});
app.use('/', serveIndex(ROOT_FOLDER, { icons: true }));
app.use(lastMile());

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Surfer listening on http://%s:%s', host, port);
    console.log('Using base path', ROOT_FOLDER);
});
