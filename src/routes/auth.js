'use strict';

import { HttpSuccess } from '@cloudron/connect-lastmile';

function getProfile(req, res, next) {
    next(new HttpSuccess(200, { username: req.user.username, name: req.user.name || req.user.displayName || '' }));
}

export default { getProfile };
