#!/bin/bash

set -eu

export NODE_ENV=production

chown -R cloudron:cloudron /app/data

/usr/local/bin/gosu cloudron:cloudron || node /app/code/app.js /app/data
