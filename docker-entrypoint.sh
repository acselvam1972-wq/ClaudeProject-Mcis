#!/bin/sh
set -e
# Apply pending database migrations before starting the server.
node node_modules/prisma/build/index.js migrate deploy
exec "$@"
