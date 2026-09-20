#!/usr/bin/env bash
# sandbox-services — start/stop the runtime (API :4000, worker :4300,
# web :4500 production) with pidfiles + logs in .data, then, on start,
# import the footage library and regenerate the demo campaign once the
# API is healthy. Idempotent.
#
#   sandbox-services.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
RUN="$ROOT/.data/run"
mkdir -p "$RUN"

export EXCLUSIVE_ADMIN_PASSWORD="${EXCLUSIVE_ADMIN_PASSWORD:-Lumen@Owner#2026!Riyadh}"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

start_one() { # start_one <name> <pidfile> <logfile> <command...>
  local name="$1" pidfile="$2" logfile="$3"; shift 3
  if alive "$pidfile"; then echo "  ✓ $name already running (pid $(cat "$pidfile"))"; return; fi
  nohup "$@" >"$logfile" 2>&1 &
  echo $! > "$pidfile"
  sleep 0.3
  if alive "$pidfile"; then echo "  ▸ $name started (pid $(cat "$pidfile"))"; else echo "  ✖ $name failed — see $logfile" >&2; exit 1; fi
}

case "${1:-status}" in
  start)
    echo "══ starting services ══════════════════════════════════════════"
    start_one api    "$RUN/api.pid"    "$RUN/api.log"    env PORT=4000 EXCLUSIVE_ADMIN_PASSWORD="$EXCLUSIVE_ADMIN_PASSWORD" node infra/scripts/run-api.mjs
    start_one worker "$RUN/worker.pid" "$RUN/worker.log" env PORT=4300 ACA_LOCAL_GENERATION=1 node --env-file="$ROOT/.env.local" apps/worker/dist/main.js
    # next start must run from apps/web (it resolves ./.next relative to cwd)
    start_one web    "$RUN/web.pid"    "$RUN/web.log"    bash -c 'cd apps/web && exec env API_UPSTREAM=http://127.0.0.1:4000 PORT=4500 node node_modules/next/dist/bin/next start -p 4500 -H 0.0.0.0'

    echo "  ▸ waiting for API health…"
    for _ in $(seq 1 60); do
      if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then break; fi
      sleep 1
    done
    curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1 || { echo "  ✖ API never became healthy — see $RUN/api.log" >&2; exit 1; }
    echo "  ✓ API healthy"

    echo "  ▸ waiting for web server…"
    for _ in $(seq 1 30); do
      if curl -sf -o /dev/null http://127.0.0.1:4500/ 2>/dev/null; then break; fi
      sleep 1
    done
    curl -sf -o /dev/null http://127.0.0.1:4500/ 2>/dev/null || { echo "  ✖ web never answered on :4500 — see $RUN/web.log" >&2; exit 1; }
    echo "  ✓ web answering on :4500"

    echo "  ▸ importing footage library…"
    node infra/scripts/import-footage.mjs http://127.0.0.1:4500 || echo "  ⚠ footage import had failures (continuing)"

    echo "  ▸ regenerating demo campaign (3× 20s videos, ~3 min)…"
    node infra/scripts/demo-campaign.mjs http://127.0.0.1:4500 || echo "  ⚠ demo campaign had failures (continuing)"

    cat <<EOF

✅ ALL SERVICES UP
   Web (production): http://127.0.0.1:4500  → preview: https://4500-\${SANDBOX_HOST}.e2b.app
   API:              http://127.0.0.1:4000
   Worker:           http://127.0.0.1:4300
   Logs:             $RUN/*.log
EOF
    ;;
  stop)
    for name in web worker api; do
      pidfile="$RUN/$name.pid"
      if alive "$pidfile"; then
        pkill -P "$(cat "$pidfile")" 2>/dev/null || true
        kill "$(cat "$pidfile")" 2>/dev/null || true
        rm -f "$pidfile"
        echo "  ✓ $name stopped"
      fi
    done
    ;;
  status)
    for name in api worker web; do
      if alive "$RUN/$name.pid"; then echo "$name: running (pid $(cat "$RUN/$name.pid"))"; else echo "$name: stopped"; fi
    done
    ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1;;
esac
