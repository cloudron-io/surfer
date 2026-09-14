#!/bin/bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [[ ! -f .env.sh ]]; then
    echo "=> Creating ${SCRIPT_DIR}/.env.sh — add an OpenID client on your Cloudron and set the OIDC variables"
    cat << 'EOF' > .env.sh
# OIDC for local development (@cloudron/tegel). Create a client at your Cloudron OpenID provider.
export OIDC_ISSUER_ORIGIN="https://my.DOMAIN.TLD/openid"
export OIDC_CLIENT_ID="YOUR_CLIENT_ID"
export OIDC_CLIENT_SECRET="YOUR_CLIENT_SECRET"
# Optional: label shown on the login screen (defaults to OpenID)
# export CLOUDRON_OIDC_PROVIDER_NAME="My Cloudron"
EOF
fi

BACKEND_PORT="${PORT:-3000}"

echo "=> Using env from .env.sh"
cat .env.sh
source .env.sh

export CLOUDRON_APP_ORIGIN="http://localhost:${BACKEND_PORT}"

echo ""
echo "┌────────────────────────────────────────────────────────────┐"
echo "│ Frontend development                                       │"
echo "├────────────────────────────────────────────────────────────┤"
echo "│ In a second terminal for hot reload:                       │"
echo "│                                                            │"
echo "│   npm run dev                                              │"
echo "│                                                            │"
echo "│ Then open e.g. http://localhost:5173/admin.html            │"
echo "└────────────────────────────────────────────────────────────┘"
echo ""

echo "=> Start surfer"
node ./server.js
