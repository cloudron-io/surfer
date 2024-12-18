#!/bin/bash

set -eu

# Create a new oidc client in your test cloudron with and fill in the blanks
export OIDC_ISSUER="https://my.nebulon.space"
export APP_ORIGIN="http://localhost:3000"
export OIDC_CLIENT_ID="surfer"
export OIDC_CLIENT_SECRET="secret"

echo "=> Start surfer"
node ./server.js
