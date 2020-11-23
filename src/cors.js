/* jshint node:true */

'use strict';

var url = require('url');

/*
 * CORS middleware
 *
 * options can contains a list of origins
 */
module.exports = function cors(options) {
    options = options || { };
    var maxAge = options.maxAge || 60 * 60 * 25 * 5; // 5 days
    var origins = options.origins || [ '*' ];
    var allowCredentials = options.allowCredentials || false; // cookies

    return function (req, res, next) {
        var requestOrigin = req.headers.origin;
        if (!requestOrigin) return next();

        requestOrigin = url.parse(requestOrigin);
        if (!requestOrigin.host) return res.status(405).send('CORS not allowed from this domain');

        var hostname = requestOrigin.host.split(':')[0]; // remove any port
        var originAllowed = origins.some(function (o) { return o === '*' || o === hostname; });
        if (!originAllowed) {
            return res.status(405).send('CORS not allowed from this domain');
        }

        // respond back with req.headers.origin which might contain the scheme
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Credentials', allowCredentials);

        // handle preflighted requests
        if (req.method === 'OPTIONS') {
            if (req.headers['access-control-request-method']) {
                res.header('Access-Control-Allow-Methods', 'GET, PUT, DELETE, POST, OPTIONS');
            }

            if (req.headers['access-control-request-headers']) {
                res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            }

            res.header('Access-Control-Max-Age', maxAge);

            return res.status(200).send();
        }

        if (req.headers['access-control-request-headers']) {
            res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
        }

        next();
    };
};
