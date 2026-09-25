#!/usr/bin/env node

'use strict';

import fs from 'fs';
import path from 'path';
import * as tegel from '@cloudron/tegel';
import deploy from './src/deploy.js';
import domains from './src/domains.js';
import history from './src/history.js';
import mime from './src/mime.js';
import settings from './src/settings.js';
import sites from './src/sites.js';
import { register } from './src/routes/index.js';

const ROOT_FOLDER = sites.primaryRoot;
const DB_FILE = path.resolve(import.meta.dirname, process.argv[3] || 'db.sqlite');
const FAVICON_FILE = path.resolve(import.meta.dirname, process.argv[4] || 'favicon.png');
const FAVICON_FALLBACK_FILE = path.resolve(import.meta.dirname, 'dist', 'logo.png');

// A crashed deploy can leave the live folder renamed aside. Restore it before creating an empty one.
deploy.recover();

// Ensure the root folder exists
fs.mkdirSync(ROOT_FOLDER, { recursive: true });
sites.prepare();

console.log(`Using database at: ${DB_FILE}`);
settings.init(DB_FILE);
domains.init(sites.dataDir, sites.primaryName(), sites.exactAliases());
history.init();
const config = settings.load();

const testMode = process.env.SURFER_ENV === 'test' ? { username: 'girish', name: 'Girish' } : null;
const oidcConfig = testMode ? null : (process.env.CLOUDRON ? {} : (process.env.OIDC_ISSUER_ORIGIN ? {
    issuer: process.env.OIDC_ISSUER_ORIGIN,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
} : null));

// skipLastMile: surfer has its own trailing static/routing handlers that must run before the error handler
const { app, router, express } = await tegel.createExpressApp({ oidcConfig, testMode, skipLastMile: true });

// Setup mime-type handling
mime(express);

register({
    app,
    router,
    express,
    config,
    appRoot: import.meta.dirname,
    faviconFile: FAVICON_FILE,
    faviconFallback: FAVICON_FALLBACK_FILE,
});

const port = process.env.SURFER_ENV === 'test' && process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, function () {
    const actual = this.address().port;
    console.log(`Base path: ${ROOT_FOLDER}`);
    const aliases = sites.aliasPatterns();
    if (aliases.length) console.log(`Alias domains: ${aliases.join(', ')}`);
    console.log();
    console.log(`Listening on http://localhost:${actual}`);
});
