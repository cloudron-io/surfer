#!/bin/bash

set -eu

export NODE_ENV=production

chown -R cloudron:cloudron /app/data

exec /usr/local/bin/gosu cloudron:cloudron node /app/code/server.js /app/data
