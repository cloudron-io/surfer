#!/usr/bin/env node

'use strict';

var express = require('express'),
    morgan = require('morgan'),
    compression = require('compression'),
    bodyParser = require('body-parser'),
    lastMile = require('connect-lastmile'),
    multipart = require('./src/multipart'),
    files = require('./src/files.js');

var app = express();
var router = new express.Router();

var multipart = multipart({ maxFieldsSize: 2 * 1024, limit: '512mb', timeout: 3 * 60 * 1000 });

router.get('/api/files/*', files.get);
router.put('/api/files/*', multipart, files.put);
router.delete('/api/files/*', files.del);

app.use(morgan('dev'));
app.use(compression());
app.use(bodyParser.json());
app.use(express.static(__dirname + '/files'));
app.use(router);
app.use(lastMile());

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Surfer listening at http://%s:%s', host, port);
});