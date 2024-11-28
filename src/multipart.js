'use strict';

import multiparty from 'multiparty';

function _mime(req) {
  const str = req.headers['content-type'] || '';
  return str.split(';')[0];
}

export default function multipart(options) {
    return function (req, res, next) {
        if (_mime(req) !== 'multipart/form-data') return next(null);

        const form = new multiparty.Form({
            uploadDir: '/tmp',
            keepExtensions: true,
            maxFieldsSize: options.maxFieldsSize || (2 * 1024), // only field size, not files
            limit: options.limit || '500mb', // file sizes
            autoFiles: true
        });

        req.fields = { };
        req.files = { };

        form.parse(req, function (err, fields, files) {
            if (err) {
                if (!res.headersSent) res.status(400).send('Error parsing request');
                return;
            }

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

