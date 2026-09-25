'use strict';

import crypto from 'node:crypto';
import path from 'node:path';
import { HttpError, HttpSuccess } from '@cloudron/connect-lastmile';

const PASSWORD_PLACEHOLDER = '__PLACEHOLDER__';
const PASSWORD_COOKIE = 'surfer.auth';

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

function createAccess({ config, appRoot }) {
    function getCookie(req, name) {
        const header = req.headers.cookie || '';
        const parts = header.split(';');
        for (const part of parts) {
            const idx = part.indexOf('=');
            if (idx === -1) continue;
            if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
        }
        return null;
    }

    function passwordAuthToken() {
        // key = config.accessPassword (secret PBKDF2-derived key); message = the salt. both rotate on password change
        return crypto.createHmac('sha256', config.accessPassword).update(config.accessPasswordSalt).digest('hex');
    }

    function isPasswordAuthCookie(req) {
        const value = getCookie(req, PASSWORD_COOKIE);
        if (!value) return false;

        const a = Buffer.from(value, 'hex');
        const b = Buffer.from(passwordAuthToken(), 'hex');

        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    function handleProtection(req, res, next) {
        if (!config.accessRestriction) return next();                        // no protection
        if (config.accessRestriction === 'password' && isPasswordAuthCookie(req)) return next(); // password protection
        if (config.accessRestriction === 'user' && req.session.user) return next();               // openid user protection

        res.status(401).sendFile(path.join(appRoot, 'dist', 'protected.html'));
    }

    function protectedLogin(req, res, next) {
        if (config.accessRestriction === 'password') {
            const saltBinary = Buffer.from(config.accessPasswordSalt, 'hex');
            crypto.pbkdf2(req.body.password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
                if (error) {
                    console.log('Failed to derive key.', error);
                    return next(new HttpError(500, 'internal error'));
                }

                const derivedKeyHex = Buffer.from(derivedKey, 'binary').toString('hex');
                if (derivedKeyHex !== config.accessPassword) return next(new HttpError(403, 'forbidden'));

                res.cookie(PASSWORD_COOKIE, passwordAuthToken(), {
                    httpOnly: true,
                    secure: !!process.env.CLOUDRON || process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });

                next(new HttpSuccess(200, {}));
            });
        } else {
            next(new HttpError(409, 'site is not protected'));
        }
    }

    function updatePassword(password, callback) {
        crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
            if (error) return callback(error);

            crypto.pbkdf2(password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST, function (error, derivedKey) {
                if (error) return callback(error);

                config.accessPassword = Buffer.from(derivedKey, 'binary').toString('hex');
                config.accessPasswordSalt = salt.toString('hex');
                callback();
            });
        });
    }

    return { handleProtection, protectedLogin, updatePassword };
}

export { PASSWORD_PLACEHOLDER };
export default createAccess;
