/* jshint node:true */

'use strict';

var multiparty = require('multiparty');

function _mime(req) {
  var str = req.headers['content-type'] || '';
  return str.split(';')[0];
}

module.exports = function multipart(options) {
    return function (req, res, next) {
        if (_mime(req) !== 'multipart/form-data') return next(null);

        var form = new multiparty.Form({
            uploadDir: '/tmp',
            keepExtensions: true,
            maxFieldsSize: options.maxFieldsSize || (2 * 1024), // only field size, not files
            limit: options.limit || '500mb', // file sizes
            autoFiles: true
        });

        req.fields = { };
        req.files = { };

        form.parse(req, function (err, fields, files) {
            if (err) return res.status(400).send('Error parsing request');
            next(null);
        });

        form.on('file', function (name, file) {
            req.files[name] = file;
        });

        form.on('field', function (name, value) {
            req.fields[name] = value; // otherwise fields.name is an array
        });
    };
};

