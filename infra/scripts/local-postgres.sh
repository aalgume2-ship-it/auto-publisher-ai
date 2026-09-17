#!/usr/bin/env bash
# local-postgres — embedded PostgreSQL 17 without docker (binaries ship inside
# the @embedded-postgres/linux-x64 npm tarball; the npm registry is reachable
# even when every other host is blocked).
#
#   local-postgres.sh start   → install binaries (once), init data dir, boot, create db
#   local-postgres.sh stop    → pg_ctl stop
#   local-postgres.sh status  → is the server up?
#
# Data lives in <repo>/.data/pg17. NOTE: .data is wiped by sandbox restarts —
# this script re-initializes from scratch, after which the boot flow re-pushes
# the schema and re-seeds.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="$ROOT/.data/pg17"
PORT="${PG_PORT:-5433}"
TOOLS="$ROOT/.data/tools"
PGBIN="$TOOLS/node_modules/@embedded-postgres/linux-x64/native/bin"

install_bins() {
  if [ ! -x "$PGBIN/postgres" ]; then
    mkdir -p "$TOOLS"
    [ -f "$TOOLS/package.json" ] || echo '{"name":"local-tools","private":true}' > "$TOOLS/package.json"
    (cd "$TOOLS" && npm install --no-audit --no-fund @embedded-postgres/linux-x64@17.10.0-beta.17 >/dev/null)
  fi
}

cmd="${1:-status}"
case "$cmd" in
  start)
    install_bins
    if ! "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      if [ ! -f "$DATA/PG_VERSION" ]; then
        rm -rf "$DATA"; mkdir -p "$DATA"
        "$PGBIN/initdb" -D "$DATA" -U aca --auth=trust -E UTF8 >/dev/null
        echo "▸ postgres: data dir initialized"
      fi
      "$PGBIN/pg_ctl" -D "$DATA" -l "$ROOT/.data/pg17.log" -o "-p $PORT -c listen_addresses=127.0.0.1" start >/dev/null
      sleep 1
    fi
    if ! (echo "SELECT 1" | "$PGBIN/postgres" -h 127.0.0.1 -p "$PORT" -U aca -d autocreator -t >/dev/null 2>&1); then
      (echo "CREATE DATABASE autocreator;" | "$PGBIN/postgres" -h 127.0.0.1 -p "$PORT" -U aca -d postgres) || true
      echo "▸ postgres: database autocreator ensured"
    fi
    echo "✓ postgres listening on 127.0.0.1:$PORT"
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true
    echo "✓ postgres stopped"
    ;;
  status)
    if "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1 2>&1; then echo "running"; else echo "stopped"; fi
    ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1;;
esac
