'use strict';

import webdav from 'webdav-server';
import auth from '../auth.js';
import sites from '../sites.js';

class SiteFileSystem extends webdav.v2.FileSystem {
    constructor() {
        super(null);
        this.byRoot = new Map();
    }

    filesystem() {
        const root = sites.currentRoot();
        let filesystem = this.byRoot.get(root);
        if (!filesystem) {
            filesystem = new webdav.v2.PhysicalFileSystem(root);
            this.byRoot.set(root, filesystem);
        }
        return filesystem;
    }

    _create(webPath, ctx, callback) { return this.filesystem()._create(webPath, ctx, callback); }
    _delete(webPath, ctx, callback) { return this.filesystem()._delete(webPath, ctx, callback); }
    _openWriteStream(webPath, ctx, callback) { return this.filesystem()._openWriteStream(webPath, ctx, callback); }
    _openReadStream(webPath, ctx, callback) { return this.filesystem()._openReadStream(webPath, ctx, callback); }
    _move(pathFrom, pathTo, ctx, callback) { return this.filesystem()._move(pathFrom, pathTo, ctx, callback); }
    _size(webPath, ctx, callback) { return this.filesystem()._size(webPath, ctx, callback); }
    _lockManager(webPath, ctx, callback) { return this.filesystem()._lockManager(webPath, ctx, callback); }
    _propertyManager(webPath, ctx, callback) { return this.filesystem()._propertyManager(webPath, ctx, callback); }
    _readDir(webPath, ctx, callback) { return this.filesystem()._readDir(webPath, ctx, callback); }
    _creationDate(webPath, ctx, callback) { return this.filesystem()._creationDate(webPath, ctx, callback); }
    _lastModifiedDate(webPath, ctx, callback) { return this.filesystem()._lastModifiedDate(webPath, ctx, callback); }
    _type(webPath, ctx, callback) { return this.filesystem()._type(webPath, ctx, callback); }
}

function install(app) {
    const webdavServer = new webdav.v2.WebDAVServer({
        requireAuthentification: true,
        httpAuthentication: new webdav.v2.HTTPBasicAuthentication(new auth.WebdavUserManager(), 'Cloudron Surfer')
    });

    webdavServer.setFileSystem('/', new SiteFileSystem(), function (success) {
        if (!success) console.error('Failed to setup webdav server!');
    });

    const webdavMiddleware = webdav.v2.extensions.express('/_webdav', webdavServer);
    app.use(function (req, res, next) {
        sites.run(req, function () { webdavMiddleware(req, res, next); });
    });
}

export default { install };
