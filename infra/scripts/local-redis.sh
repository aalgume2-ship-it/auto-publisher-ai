#!/usr/bin/env bash
# local-redis — redis-server 7.2.5 from the git-vendored binary (no docker,
# no source build, no downloads). Extracts on first use into .data/bin.
#
#   local-redis.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/.data/bin/redis-server"
VENDOR="$ROOT/infra/vendor/bin/redis-server-7.2.5-x64.gz"
PIDFILE="$ROOT/.data/redis.pid"
PORT="${REDIS_PORT:-6379}"

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-status}" in
  start)
    if ! alive; then
      mkdir -p "$ROOT/.data/bin" "$ROOT/.data/redis"
      if [ ! -x "$BIN" ]; then
        gzip -dc "$VENDOR" > "$BIN" && chmod +x "$BIN"
      fi
      "$BIN" --daemonize yes --port "$PORT" --dir "$ROOT/.data/redis" --pidfile "$PIDFILE" --save '' --appendonly no
      sleep 0.5
    fi
    if alive; then echo "✓ redis listening on 127.0.0.1:$PORT"; else echo "✖ redis failed to start" >&2; exit 1; fi
    ;;
  stop)
    if alive; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; sleep 0.3; fi
    echo "✓ redis stopped"
    ;;
  status)
    if alive; then echo "running"; else echo "stopped"; fi
    ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1;;
esac
