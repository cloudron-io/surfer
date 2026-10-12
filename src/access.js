'use strict';

import crypto from 'node:crypto';
import { promisify } from 'node:util';
import settings from './settings.js';
import SurferError from './surfererror.js';

const PASSWORD_PLACEHOLDER = '__PLACEHOLDER__';
const PASSWORD_COOKIE = 'surfer.auth';

const CRYPTO_SALT_SIZE = 64; // 512-bit salt
const CRYPTO_ITERATIONS = 10000; // iterations
const CRYPTO_KEY_LENGTH = 512; // bits
const CRYPTO_DIGEST = 'sha1'; // used to be the default in node 4.1.1 cannot change since it will affect existing db records

const pbkdf2 = promisify(crypto.pbkdf2);

function getCookie(header, name) {
    const parts = (header || '').split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
    }
    return null;
}

function passwordAuthToken() {
    const config = settings.current();
    // key = config.accessPassword (secret PBKDF2-derived key); message = the salt. both rotate on password change
    return crypto.createHmac('sha256', config.accessPassword).update(config.accessPasswordSalt).digest('hex');
}

function cookieMatches(cookieHeader) {
    const value = getCookie(cookieHeader, PASSWORD_COOKIE);
    if (!value) return false;

    const a = Buffer.from(value, 'hex');
    const b = Buffer.from(passwordAuthToken(), 'hex');

    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function hashPassword(password) {
    try {
        const salt = crypto.randomBytes(CRYPTO_SALT_SIZE);
        const derivedKey = await pbkdf2(password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST);
        return {
            accessPassword: Buffer.from(derivedKey, 'binary').toString('hex'),
            accessPasswordSalt: salt.toString('hex'),
        };
    } catch {
        throw new SurferError(SurferError.INTERNAL_ERROR, 'failed to set password');
    }
}

async function login(password) {
    const config = settings.current();
    if (config.accessRestriction !== 'password') throw new SurferError(SurferError.NOT_PROTECTED, 'site is not protected');

    const saltBinary = Buffer.from(config.accessPasswordSalt, 'hex');
    let derivedKey;
    try {
        derivedKey = await pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, CRYPTO_DIGEST);
    } catch (error) {
        console.log('Failed to derive key.', error);
        throw new SurferError(SurferError.INTERNAL_ERROR, 'internal error');
    }

    const derivedKeyHex = Buffer.from(derivedKey, 'binary').toString('hex');
    if (derivedKeyHex !== config.accessPassword) throw new SurferError(SurferError.ACCESS_DENIED, 'forbidden');

    return passwordAuthToken();
}

export default {
    PASSWORD_PLACEHOLDER,
    PASSWORD_COOKIE,
    cookieMatches,
    hashPassword,
    login,
};
