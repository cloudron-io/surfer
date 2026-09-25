'use strict';

import * as tegel from '@cloudron/tegel';
import { lastMile } from '@cloudron/connect-lastmile';
import auth from '../auth.js';
import cors from '../cors.js';
import deploy from '../deploy.js';
import history from '../history.js';
import multipart from '../multipart.js';
import createAccess from './access.js';
import extract from './extract.js';
import files from './files.js';
import createPublic from './public.js';
import createSettings from './settings.js';
import siteRoutes from './sites.js';
import webdav from './webdav.js';

function logRequests(req, res, next) {
    res.on('finish', function () {
        const status = res.statusCode;
        if (status < 200 || status >= 400) {
            console.warn(req.method + ' ' + (req.originalUrl || req.url) + ' ' + status);
        }
    });
    next();
}

function setReturnTo(req, res, next) {
    req.session.returnTo = req.query.returnTo || '/';
    next();
}

function oidcCallbackHandler(req, res) {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;

    return tegel.oidcCallback(returnTo, '/?error=auth_failed', async () => {})(req, res);
}

function register({ app, router, express, config, appRoot, faviconFile, faviconFallback }) {
    const publicSite = createPublic({ express, config, appRoot });
    const access = createAccess({ config, appRoot });
    const settings = createSettings({
        config,
        faviconFile,
        faviconFallback,
        resetStatic: publicSite.resetStatic,
        updatePassword: access.updatePassword,
    });

    router.use(logRequests);
    router.use(cors({ origins: [ '*' ], allowCredentials: false }));
    router.use('/api', express.urlencoded({ extended: false, limit: '100mb' }));

    router.get   ('/auth/login', setReturnTo, tegel.oidcRedirectToLoginProvider);
    router.get   ('/auth/callback', oidcCallbackHandler);
    router.get   ('/auth/logout', tegel.logout('/'));

    router.post  ('/api/protectedLogin', access.protectedLogin);
    router.get   ('/api/settings', settings.get);
    router.get   ('/api/favicon', settings.getFavicon);
    router.put   ('/api/favicon', auth.requireAuth, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), settings.putFavicon);
    router.delete('/api/favicon', auth.requireAuth, settings.deleteFavicon);
    router.put   ('/api/settings', auth.requireAuth, settings.put);
    router.get   ('/api/profile', auth.requireAuth, auth.getProfile);
    router.get   ('/api/files/*path', auth.requireAuth, files.get);
    router.post  ('/api/files/*path', auth.requireAuth, multipart({ maxFieldsSize: 2 * 1024, limit: '512mb' }), files.post);
    router.put   ('/api/files/*path', auth.requireAuth, files.put);
    router.delete('/api/files/*path', auth.requireAuth, files.del);
    router.post  ('/api/copy', auth.requireAuth, files.copy);
    router.post  ('/api/extract', auth.requireAuth, extract.extract);
    router.post  ('/api/deploy', auth.requireAuth, deploy.deploy);
    router.get   ('/api/history', auth.requireAuth, history.get);
    router.get   ('/api/sites', auth.requireAuth, siteRoutes.list);
    router.post  ('/api/sites', auth.requireAuth, siteRoutes.create);
    router.put   ('/api/sites/:domain', auth.requireAuth, siteRoutes.update);
    router.delete('/api/sites/:domain', auth.requireAuth, siteRoutes.remove);
    router.post  ('/api/sites/:name/default', auth.requireAuth, deploy.promote);
    router.get   ('/api/zip', access.handleProtection, publicSite.zipDownload);
    router.get   ('/api/healthcheck', function (req, res) { res.status(200).send(); });

    webdav.install(app);
    publicSite.install(app, access.handleProtection);
    app.use(lastMile());
}

export { register };
