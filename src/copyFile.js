'use strict';

var fs = require('fs'),
    path = require('path');

// http://stackoverflow.com/questions/11293857/fastest-way-to-copy-file-in-node-js
module.exports = function copyFile(source, target, cb) {
    var cbCalled = false;

    // ensure directory
    fs.mkdir(path.dirname(target), { recursive: true }, function (error) {
        if (error) return cb(error);

        var rd = fs.createReadStream(source);
            rd.on("error", function(err) {
            done(err);
        });

        var wr = fs.createWriteStream(target);
            wr.on("error", function(err) {
            done(err);
        });

        wr.on("close", function(ex) {
            done();
        });

        rd.pipe(wr);

        function done(err) {
            if (!cbCalled) {
                cb(err);
                cbCalled = true;
            }
        }
    });
};
