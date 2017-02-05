#!/usr/bin/env node

'use strict';


var express = require('express'),
    morgan = require('morgan'),
    passport = require('passport'),
    path = require('path'),
    compression = require('compression'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    lastMile = require('connect-lastmile'),
    multipart = require('./src/multipart'),
    mkdirp = require('mkdirp'),
    auth = require('./src/auth.js'),
    serveIndex = require('serve-index'),
    files = require('./src/files.js')(path.resolve(__dirname, process.argv[2] || 'files'));

var app = express();
var router = new express.Router();

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.get   ('/api/files/*', auth.verify, files.get);
router.put   ('/api/files/*', auth.verify, multipart, files.put);
router.delete('/api/files/*', auth.verify, files.del);
router.get   ('/api/healthcheck', function (req, res) { res.status(200).send(); });

// welcome screen in case / does not serve up any file yet
router.get('/', function (req, res) { res.status(200).sendFile(path.join(__dirname, '/frontend/welcome.html')); });

var rootFolder = path.resolve(__dirname, process.argv[2] || 'files');

app.use(morgan('dev'));
app.use(compression());
app.use('/_admin', express.static(__dirname + '/frontend'));
app.use(express.static(rootFolder));
app.use(serveIndex(rootFolder, { icons: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false, limit: '100mb' }));
app.use(cookieParser());
app.use(session({ secret: 'surfin surfin', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(router);
app.use(lastMile());

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    var basePath = path.resolve(__dirname, process.argv[2] || 'files');
    mkdirp.sync(basePath);

    console.log('Surfer listening at http://%s:%s', host, port);
    console.log('Using base path', basePath);
});
