#!/bin/bash

set -eu

export NODE_ENV=production
export TOKENSTORE_FILE=/app/data/tokens.json

# Configure OIDC
# CLOUDRON_OIDC_PROVIDER_NAME is not supported
export OIDC_ISSUER=$CLOUDRON_OIDC_ISSUER
export APP_ORIGIN=$CLOUDRON_APP_ORIGIN
export OIDC_CLIENT_ID=$CLOUDRON_OIDC_CLIENT_ID
export OIDC_CLIENT_SECRET=$CLOUDRON_OIDC_CLIENT_SECRET
export OIDC_CALLBACK_PATH="/api/oidc/callback"
export OIDC_LOGOUT_PATH="/api/oidc/logout"

[[ -d /app/data/surfer_root ]] && mv /app/data/surfer_root /app/data/public
mkdir -p /app/data/public

echo "=> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "=> Start the server"
exec /usr/local/bin/gosu cloudron:cloudron node /app/code/server.js /app/data/public /app/data/.surfer.json /app/data/favicon.png
