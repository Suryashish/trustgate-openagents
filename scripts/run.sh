#!/usr/bin/env bash
# TrustGate one-command bring-up — Phase 8.
#
# Boots the full stack with one command instead of five terminals:
#   1. Three AXL nodes (n1 sender, n2/n3 receivers — via start_axl_nodes.sh)
#   2. Two Phase-4 workers on n2's a2a_port (9014) + n3's (9024)
#   3. Flask API on :8000
#   4. Next.js dev server on :3000
#
# Idempotent: each step skips quietly if the target is already up.
# Logs go to ./logs/<service>.log with one tagged line per service printed
# to stdout. A single Ctrl-C (or scripts/stop.sh) tears the whole stack down.
#
# WSL-only — the AXL binary is a Linux ELF.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

# ---- Pretty per-service prefix --------------------------------------------
# Each background log is tee'd through `prefix <name>` so the user sees one
# stream of color-coded lines instead of five log files. Colors degrade to
# plain text when stdout isn't a TTY.
if [[ -t 1 ]]; then
  C_AXL=$'\033[36m'   # cyan
  C_API=$'\033[32m'   # green
  C_WORK=$'\033[33m'  # yellow
  C_DASH=$'\033[35m'  # magenta
  C_OK=$'\033[1;32m'  # bold green
  C_ERR=$'\033[1;31m' # bold red
  C_RST=$'\033[0m'
else
  C_AXL=""; C_API=""; C_WORK=""; C_DASH=""; C_OK=""; C_ERR=""; C_RST=""
fi

prefix() {
  local tag="$1" color="$2"
  awk -v t="$tag" -v c="$color" -v r="$C_RST" '{
    printf "%s[%s]%s %s\n", c, t, r, $0; fflush();
  }'
}

# ---- Preflight checks -----------------------------------------------------
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "${C_ERR}missing $1${C_RST}"; missing=1; }
}
missing=0
need curl
need python3
[[ -d "$ROOT/.venv" ]] || { echo "${C_ERR}missing .venv — see README first-time setup${C_RST}"; missing=1; }
[[ -x "$ROOT/AXL/node" ]] || { echo "${C_ERR}missing AXL/node binary${C_RST}"; missing=1; }
[[ -d "$ROOT/frontend/node_modules" ]] || { echo "${C_ERR}missing frontend/node_modules — run \`cd frontend && CI=true pnpm install\`${C_RST}"; missing=1; }
((missing == 0)) || exit 2

# Track every PID we spawn so the cleanup trap can kill them on Ctrl-C.
PIDS=()
cleanup() {
  echo
  echo "${C_OK}stopping…${C_RST}"
  # nice → mean
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  sleep 0.5
  for pid in "${PIDS[@]:-}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  exit 0
}
trap cleanup INT TERM

# ---- 1) AXL mesh ----------------------------------------------------------
echo "${C_AXL}[axl]${C_RST} starting three-node mesh"
bash "$ROOT/scripts/start_axl_nodes.sh" 2>&1 | prefix axl "$C_AXL" || {
  echo "${C_ERR}AXL start failed — see ~/axl-test/n*/node.log${C_RST}"; exit 3;
}

# ---- 2) Phase-4 workers ---------------------------------------------------
worker_up() { pgrep -f "phase4_worker.py.*--port $1" >/dev/null 2>&1; }

start_worker() {
  local port="$1" name="$2"
  if worker_up "$port"; then
    echo "${C_WORK}[$name]${C_RST} already running on :$port"
    return
  fi
  ( cd "$ROOT" && PYTHONPATH=app .venv/bin/python -u app/phase4_worker.py \
      --port "$port" --name "$name" > "$LOGS/$name.log" 2>&1 & echo $! > "$LOGS/$name.pid" ) || true
  local pid; pid=$(cat "$LOGS/$name.pid" 2>/dev/null || echo "")
  [[ -n "$pid" ]] && PIDS+=("$pid")
  # Tail the log into the unified stream — non-blocking.
  ( tail -n 0 -F "$LOGS/$name.log" 2>/dev/null | prefix "$name" "$C_WORK" ) &
  PIDS+=("$!")
  echo "${C_WORK}[$name]${C_RST} starting on :$port (pid ${pid:-?})"
}
start_worker 9014 worker-b
start_worker 9024 worker-c

# ---- 3) Flask API ---------------------------------------------------------
api_up() { curl -sf http://127.0.0.1:8000/api/health >/dev/null 2>&1; }

if api_up; then
  echo "${C_API}[api]${C_RST} already up"
else
  ( cd "$ROOT" && PYTHONPATH=app .venv/bin/python -u app/server.py > "$LOGS/api.log" 2>&1 & echo $! > "$LOGS/api.pid" ) || true
  pid=$(cat "$LOGS/api.pid" 2>/dev/null || echo "")
  [[ -n "$pid" ]] && PIDS+=("$pid")
  ( tail -n 0 -F "$LOGS/api.log" 2>/dev/null | prefix api "$C_API" ) &
  PIDS+=("$!")
  echo "${C_API}[api]${C_RST} starting on :8000 (pid ${pid:-?})"

  # Block until /api/health responds — keeps the user from clicking through
  # to a dashboard that 502s on every request.
  for i in $(seq 1 40); do
    if api_up; then echo "${C_API}[api]${C_RST} ready after ${i}s"; break; fi
    sleep 0.5
  done
  api_up || { echo "${C_ERR}api never came up — check $LOGS/api.log${C_RST}"; cleanup; }
fi

# ---- 4) Next.js dev server ------------------------------------------------
dash_up() { curl -sf -o /dev/null http://127.0.0.1:3000/ 2>&1; }

# pnpm needs to come from inside WSL; sourcing nvm here matches the README
# instructions so the dashboard works regardless of the user's shell setup.
if dash_up; then
  echo "${C_DASH}[dash]${C_RST} already up on :3000"
else
  (
    cd "$ROOT/frontend"
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
      # shellcheck disable=SC1091
      . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
      nvm use default >/dev/null 2>&1 || true
      export PATH="${NVM_BIN:-}:$PATH"
    fi
    pnpm dev > "$LOGS/dash.log" 2>&1 & echo $! > "$LOGS/dash.pid"
  )
  pid=$(cat "$LOGS/dash.pid" 2>/dev/null || echo "")
  [[ -n "$pid" ]] && PIDS+=("$pid")
  ( tail -n 0 -F "$LOGS/dash.log" 2>/dev/null | prefix dash "$C_DASH" ) &
  PIDS+=("$!")
  echo "${C_DASH}[dash]${C_RST} starting on :3000 (pid ${pid:-?})"

  # Wait for "Ready" or a working port.
  for i in $(seq 1 60); do
    if grep -q "Ready in" "$LOGS/dash.log" 2>/dev/null || dash_up; then
      echo "${C_DASH}[dash]${C_RST} ready after ${i}s"; break
    fi
    sleep 1
  done
fi

# ---- Final banner ---------------------------------------------------------
cat <<EOF

${C_OK}TrustGate is up.${C_RST}
  • dashboard  http://127.0.0.1:3000
  • api        http://127.0.0.1:8000
  • axl nodes  9002 / 9012 / 9022
  • workers    :9014 (worker-b), :9024 (worker-c)
  • logs       $LOGS/{api,dash,worker-b,worker-c}.log

Press Ctrl-C to stop, or run \`bash scripts/stop.sh\` from another shell.
EOF

# Block forever until the trap fires.
while true; do sleep 60; done
