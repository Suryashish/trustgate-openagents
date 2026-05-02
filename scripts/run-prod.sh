#!/usr/bin/env bash
# Production bring-up. Like scripts/run.sh but stripped down for a
# headless container:
#   - AXL nodes (3)
#   - Phase 4 workers (2) so /api/complete-hire works against local mocks
#   - Flask API behind gunicorn on $PORT (Railway-provided)
#
# **Resilient by design.** AXL peering / worker spawning are best-effort —
# their failure must not block gunicorn from binding $PORT, otherwise
# Railway's healthcheck on /api/health never gets a chance. Each phase
# logs its outcome with a [boot] / [boot-warn] prefix so the deploy log
# tells you exactly which sub-systems are degraded.
#
# Removing `set -e` is deliberate: previous version aborted the entire
# container on a non-zero exit from start_axl_nodes.sh, which manifested
# as "1/1 replicas never became healthy" with no log trail.
set -uo pipefail

ROOT="/app"
LOGS="/tmp/trustgate"
mkdir -p "$LOGS"

PORT="${PORT:-8000}"
echo "[boot] TrustGate API container starting · PORT=$PORT · HOME=$HOME"

# ---- Phase 1: AXL mesh ---------------------------------------------------
# Best-effort: gVisor-based TLS networking may or may not work in a given
# container runtime. If peering fails, the dashboard's read-only browse +
# wallet flows still work; only "Run a sample hire" + AXL Bridge tab break.
echo "[boot] phase 1/3: AXL mesh"
if bash "$ROOT/scripts/start_axl_nodes.sh" > "$LOGS/axl-startup.log" 2>&1; then
    echo "[boot]   ✓ AXL mesh up"
else
    rc=$?
    echo "[boot-warn] ✗ AXL mesh failed (exit $rc) — sample-hire + AXL tab will be degraded"
    echo "[boot-warn]   first 20 lines of axl-startup.log:"
    head -20 "$LOGS/axl-startup.log" 2>/dev/null | sed 's/^/[boot-warn]     /'
fi

# ---- Phase 2: Phase-4 workers --------------------------------------------
start_worker() {
    local port="$1" name="$2"
    if pgrep -f "phase4_worker.py.*--port $port" >/dev/null 2>&1; then
        echo "[boot]   $name already running"
        return 0
    fi
    cd "$ROOT" && PYTHONPATH=app python -u app/phase4_worker.py \
        --port "$port" --name "$name" > "$LOGS/$name.log" 2>&1 &
    local pid=$!
    sleep 0.5
    if kill -0 "$pid" 2>/dev/null; then
        echo "[boot]   ✓ $name spawned on :$port (pid $pid)"
    else
        echo "[boot-warn] ✗ $name died immediately — see $LOGS/$name.log"
    fi
}

echo "[boot] phase 2/3: Phase 4 workers"
start_worker 9014 worker-b
start_worker 9024 worker-c

# ---- Phase 3: Flask API + cache pre-warm ---------------------------------
# Pre-warm is *also* best-effort — the API's lazy init handles a cold
# RegistryClient on the first request. Pre-warming just avoids the first
# request paying the load cost.
echo "[boot] phase 3/3: registry cache pre-warm + gunicorn"
cd "$ROOT" && PYTHONPATH=app timeout 30 python -c "
try:
    from registry_client import RegistryClient
    rc = RegistryClient()
    print(f'[boot]   ✓ pre-warm: {len(rc._card_cache)} hydrated cards loaded', flush=True)
except Exception as e:
    print(f'[boot-warn]   pre-warm failed: {type(e).__name__}: {e}', flush=True)
" || echo "[boot-warn]   pre-warm timed out (30s) — first request will pay the cost"

# Final phase: gunicorn. This is the ONE thing that absolutely must
# succeed; everything above is decoration. `exec` replaces the shell so
# Railway's signal handling reaches gunicorn directly.
echo "[boot] handing off to gunicorn on 0.0.0.0:$PORT"
cd "$ROOT/app"
exec gunicorn \
    --workers "${GUNICORN_WORKERS:-2}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --bind "0.0.0.0:$PORT" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile - \
    server:app
