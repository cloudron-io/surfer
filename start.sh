#!/bin/bash

set -eu

export NODE_ENV=production

forever start --workingDir /app/code app.js /app/data
forever logs -f 0