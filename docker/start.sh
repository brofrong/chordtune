#!/usr/bin/env bash
# Runs the API and the web server side by side. When either exits the other is stopped and the
# container exits, so the orchestrator restarts the whole thing instead of serving half an app.
set -u

(cd /app/apps/api && exec bun src/index.ts) &
api=$!
(cd /app/web && PORT=3000 HOSTNAME=0.0.0.0 exec node apps/web/server.js) &
web=$!

trap 'kill -TERM "$api" "$web" 2>/dev/null' TERM INT

wait -n "$api" "$web"
status=$?
kill -TERM "$api" "$web" 2>/dev/null
wait
exit "$((status == 0 ? 1 : status))"
