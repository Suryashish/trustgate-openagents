#!/usr/bin/env bash
# Stop locally running AXL nodes and any lingering Phase 1 mock processes.
set -u
pkill -f 'node -config node-config.json' 2>/dev/null || true
pkill -f 'agent_b_mock.py' 2>/dev/null || true
sleep 0.5
if pgrep -af 'node -config node-config.json|agent_b_mock.py' > /dev/null; then
  echo "Some processes still running:"
  pgrep -af 'node -config node-config.json|agent_b_mock.py'
  exit 1
fi
echo "All Phase 1 processes stopped."
