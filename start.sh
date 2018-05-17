#!/bin/bash

set -eu

export NODE_ENV=production

if [[ ! -d "/app/data/surfer_root" ]]; then
    echo "=> Migrating root folder from /app/data to /app/data/surfer_root"

    mkdir -p /app/data/surfer_root
    for file in `find /app/data -maxdepth 1 -mindepth 1 -type f -printf "%f\n"`; do
        echo " => Moving /app/data/${file}"
        mv "/app/data/${file}" /app/data/surfer_root
    done

    for dir in `find /app/data -maxdepth 1 -mindepth 1 -type d -printf "%f\n"`; do
        if [[ "$dir" != "surfer_root" ]]; then
            echo " => Moving /app/data/${dir}"
            mv "/app/data/${dir}" /app/data/surfer_root
        fi
    done
fi

echo "=> Ensure permissions"
chown -R cloudron:cloudron /app/data

echo "=> Start the server"
exec /usr/local/bin/gosu cloudron:cloudron node /app/code/server.js /app/data/surfer_root /app/data/.surfer.json
