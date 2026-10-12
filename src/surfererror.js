'use strict';

import assert from 'node:assert';
import { HttpError } from '@cloudron/connect-lastmile';

class SurferError extends Error {
    static ACCESS_DENIED = 'Access Denied';
    static ALREADY_EXISTS = 'Already Exists';
    static BAD_FIELD = 'Bad Field';
    static BUSY = 'Busy';
    static CONFLICT = 'Conflict';
    static DATABASE_ERROR = 'Database Error';
    static FS_ERROR = 'FileSystem Error';
    static INTERNAL_ERROR = 'Internal Error';
    static NOT_FOUND = 'Not found';
    static NOT_PROTECTED = 'Not Protected';
    static TOO_LARGE = 'Too Large';

    constructor(reason, errorOrMessage) {
        assert.strictEqual(typeof reason, 'string');
        assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string', `string: ${errorOrMessage} type: ${typeof errorOrMessage}`);

        const message = typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage.message;
        super(message);

        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);

        this.name = this.constructor.name;
        this.reason = reason;
        if (typeof errorOrMessage !== 'string') this.nestedError = errorOrMessage;
    }

    static toHttpError(error) {
        switch (error.reason) {
        case SurferError.BAD_FIELD:
            return new HttpError(400, error);
        case SurferError.ACCESS_DENIED:
            return new HttpError(403, error);
        case SurferError.NOT_FOUND:
            return new HttpError(404, error);
        case SurferError.ALREADY_EXISTS:
        case SurferError.CONFLICT:
        case SurferError.BUSY:
        case SurferError.NOT_PROTECTED:
            return new HttpError(409, error);
        case SurferError.TOO_LARGE:
            return new HttpError(413, error);
        case SurferError.DATABASE_ERROR:
        case SurferError.FS_ERROR:
        case SurferError.INTERNAL_ERROR:
        default:
            return new HttpError(500, error);
        }
    }
}

export default SurferError;
