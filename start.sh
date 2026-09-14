#!/bin/bash

set -eu

export NODE_ENV=production
export TOKENSTORE_FILE=/app/data/tokens.json

[[ -d /app/data/surfer_root ]] && mv /app/data/surfer_root /app/data/public
mkdir -p /app/data/public

echo "=> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "=> Start the server"
exec /usr/local/bin/gosu cloudron:cloudron node /app/code/server.js /app/data/public /app/data/.surfer.json /app/data/favicon.png
