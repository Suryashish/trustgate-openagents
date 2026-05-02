#!/usr/bin/env bash
# Production bring-up. Like scripts/run.sh but stripped down for a
# headless container:
#   - AXL nodes (3)
#   - Phase 4 workers (2) so /api/complete-hire works against local mocks
#   - Flask API behind gunicorn on $PORT (Railway-provided)
#
# No Next.js dev server (frontend deploys separately to Vercel), no nvm,
# no terminal colors, no readiness banner — just structured stdout that
# Railway's log viewer can render.
set -euo pipefail

ROOT="/app"
LOGS="/tmp/trustgate"
mkdir -p "$LOGS"

echo "[boot] starting AXL mesh"
bash "$ROOT/scripts/start_axl_nodes.sh"

start_worker() {
  local port="$1" name="$2"
  if pgrep -f "phase4_worker.py.*--port $port" >/dev/null 2>&1; then
    echo "[boot] worker $name already running"
    return
  fi
  cd "$ROOT" && PYTHONPATH=app python -u app/phase4_worker.py \
      --port "$port" --name "$name" > "$LOGS/$name.log" 2>&1 &
  echo "[boot] worker $name started on :$port (pid $!)"
}

start_worker 9014 worker-b
start_worker 9024 worker-c

PORT="${PORT:-8000}"

# Pre-warm the registry client + load the bundled cache. server.py does this
# lazily on the first /api/health, but doing it here means the first real
# request doesn't pay the import cost.
cd "$ROOT" && PYTHONPATH=app python -c "
from registry_client import RegistryClient
rc = RegistryClient()
print(f'[boot] cache: {len(rc._card_cache)} hydrated cards loaded', flush=True)
"

echo "[boot] starting gunicorn on :$PORT"
exec gunicorn \
    --workers "${GUNICORN_WORKERS:-2}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --bind "0.0.0.0:$PORT" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile - \
    --chdir "$ROOT/app" \
    --pythonpath "$ROOT/app" \
    server:app
