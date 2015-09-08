#!/bin/bash

set -eu

export NODE_ENV=production

cd /app/code
app.js /app/data
