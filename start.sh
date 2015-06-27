#!/bin/bash

set -eu

export NODE_ENV=production

forever start --workingDir /app/code app.js
forever logs -f 0