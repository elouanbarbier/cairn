#!/bin/sh
# `cairn backup`, `cairn reset-password EMAIL`… inside the container.
exec node /app/cli.js "$@"
