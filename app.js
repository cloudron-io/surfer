#!/usr/bin/env node

'use strict';


var express = require('express'),
    morgan = require('morgan'),
    passport = require('passport'),
    path = require('path'),
    ejs = require('ejs'),
    fs = require('fs'),
    compression = require('compression'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    lastMile = require('connect-lastmile'),
    multipart = require('./src/multipart'),
    mkdirp = require('mkdirp'),
    auth = require('./src/auth.js'),
    files = require('./src/files.js')(path.resolve(__dirname, process.argv[2] || 'files'));

var app = express();
var router = new express.Router();

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.get   ('/api/files/*', auth.ldap, files.get);
router.put   ('/api/files/*', auth.ldap, multipart, files.put);
router.delete('/api/files/*', auth.ldap, files.del);
router.get   ('/api/healthcheck', function (req, res) { res.status(200).send(); });

// welcome screen in case / does not serve up any file yet
var appUrl = process.env.APP_ORIGIN ? process.env.APP_ORIGIN : 'http://localhost:3000';
router.get('/', function (req, res) { res.status(200).send(ejs.render(fs.readFileSync(path.join(__dirname, '/app/welcome.html'), 'utf8'), { appUrl: appUrl })); });

app.use(morgan('dev'));
app.use(compression());
app.use('/_admin', express.static(__dirname + '/app'));
app.use(express.static(path.resolve(__dirname, process.argv[2] || 'files')));
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
