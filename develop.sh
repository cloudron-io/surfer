#!/bin/bash

set -eu

# Create a new oidc client in your test cloudron with and fill in the blanks
export CLOUDRON_OIDC_ISSUER="https://my.nebulon.space"
export CLOUDRON_APP_ORIGIN="http://localhost:3000"
export CLOUDRON_OIDC_CLIENT_ID="surfer"
export CLOUDRON_OIDC_CLIENT_SECRET="secret"

echo "=> Start surfer"
node ./server.js
