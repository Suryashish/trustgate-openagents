#!/usr/bin/env bash
# Stop the entire TrustGate stack started by scripts/run.sh.
#
# Order matters: dashboard → API → workers → AXL nodes. Stopping AXL last
# means in-flight A2A messages don't get orphaned.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"

if [[ -t 1 ]]; then C_OK=$'\033[1;32m'; C_RST=$'\033[0m'; else C_OK=""; C_RST=""; fi

stop_named() {
  local name="$1" pat="$2"
  if pgrep -af "$pat" >/dev/null 2>&1; then
    pkill -f "$pat" 2>/dev/null || true
    echo "  stopped $name"
  fi
}

stop_named "dashboard"   "next-server|pnpm dev|next dev"
stop_named "Flask API"   "python.*server.py"
stop_named "phase4 workers" "phase4_worker.py"

# AXL nodes go last via the existing helper.
bash "$ROOT/scripts/stop_axl_nodes.sh" >/dev/null 2>&1 || true
echo "  stopped AXL nodes"

# Reap any orphaned tail processes spawned by run.sh.
pkill -f "tail -n 0 -F $LOGS" 2>/dev/null || true

echo "${C_OK}TrustGate stack stopped.${C_RST}"
