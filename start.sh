#!/bin/bash

set -eu

export NODE_ENV=production

cd /app/code
node app.js /app/data
