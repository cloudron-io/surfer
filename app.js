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
    auth = require('./src/auth.js'),
    files = require('./src/files.js')(path.resolve(__dirname, process.argv[2] || 'files'));

var app = express();
var router = new express.Router();

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.get('/api/files/*', auth.ldap, files.get);
router.put('/api/files/*', auth.ldap, multipart, files.put);
router.delete('/api/files/*', auth.ldap, files.del);

// healthcheck in case / does not serve up any file yet
router.get('/', function (req, res) { res.sendFile(path.join(__dirname, '/app/welcome.html')); });

app.use(morgan('dev'));
app.use(compression());
app.use('/settings', express.static(__dirname + '/app'));
app.use(express.static(__dirname + '/files'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(session({ secret: 'surfin surfin' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(router);
app.use(lastMile());


var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Surfer listening at http://%s:%s', host, port);
    console.log('Using base path', path.resolve(__dirname, process.argv[2] || 'files'));
});