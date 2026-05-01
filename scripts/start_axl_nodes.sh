#!/usr/bin/env bash
# Bring up two local AXL nodes for Phase 1 dev/test.
#
#   n1 (Agent A side / TrustGate) -> TLS :9001, API :9002
#   n2 (Agent B side)             -> peers to n1, API :9012
#
# Both share tcp_port 7000 (virtual gVisor port — fine on a single host).
# Idempotent: skips already-running nodes.
set -euo pipefail

ROOT="$HOME/axl-test"
SRC_AXL="$(cd "$(dirname "$0")/../AXL" && pwd)"

mkdir -p "$ROOT/n1" "$ROOT/n2"
cp -u "$SRC_AXL/node" "$ROOT/node"
chmod +x "$ROOT/node"

[[ -f "$ROOT/n1/private.pem" ]] || cp "$SRC_AXL/private.pem" "$ROOT/n1/private.pem"
[[ -f "$ROOT/n2/private.pem" ]] || openssl genpkey -algorithm ed25519 -out "$ROOT/n2/private.pem"

cat > "$ROOT/n1/node-config.json" <<'JSON'
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
JSON

cat > "$ROOT/n2/node-config.json" <<'JSON'
{
  "PrivateKeyPath": "private.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
JSON

start_node() {
  local name="$1" port="$2"
  if curl -s -o /dev/null "http://127.0.0.1:$port/topology"; then
    echo "[$name] already running on :$port"
    return
  fi
  cd "$ROOT/$name"
  nohup ../node -config node-config.json > node.log 2>&1 &
  cd - >/dev/null
  echo "[$name] started (pid $!), api_port=$port"
}

start_node n1 9002
start_node n2 9012

echo "Waiting for peering ..."
for _ in $(seq 1 20); do
  a_peers=$(curl -s http://127.0.0.1:9002/topology | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("peers",[])))' 2>/dev/null || echo 0)
  b_peers=$(curl -s http://127.0.0.1:9012/topology | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("peers",[])))' 2>/dev/null || echo 0)
  if [[ "$a_peers" -gt 0 && "$b_peers" -gt 0 ]]; then
    echo "Peered: n1 sees $a_peers, n2 sees $b_peers"
    exit 0
  fi
  sleep 0.5
done
echo "ERROR: peering did not converge"
exit 1
