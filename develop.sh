#!/bin/bash

set -eu

# Create a new oidc client in your test cloudron with and fill in the blanks
export OIDC_ISSUER="https://my.nebulon.space"
export APP_ORIGIN="http://localhost:3000"
export OIDC_CLIENT_ID="cid-1ab519f17e6136d3e5d0679ecf5a1119"
export OIDC_CLIENT_SECRET="e588e41e3ab084694b198d8766f24cc4fac4085c8134eb10bc7512a05b4e9450"
export LOCALDEVELOP_OIDC_ORIGIN="${APP_ORIGIN}"

echo "=> Start surfer"
node ./server.js
