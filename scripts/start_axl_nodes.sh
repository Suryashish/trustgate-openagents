#!/usr/bin/env bash
# Bring up three local AXL nodes for the Phase 1–4 demos.
#
#   n1  (TrustGate / Agent A)      -> TLS :9001, API :9002, no A2A
#   n2  (Worker B — primary)       -> peers n1, API :9012, A2A :9014
#   n3  (Worker C — fallback)      -> peers n1, API :9022, A2A :9024
#
# All three share tcp_port 7000 (virtual gVisor port — fine on a single host).
# n3 is what makes the Phase 4 retry-to-runner-up demo work: when the top
# candidate (n2) drops a job, the orchestrator re-routes to n3.
#
# Idempotent: skips already-running nodes.
set -euo pipefail

ROOT="$HOME/axl-test"
SRC_AXL="$(cd "$(dirname "$0")/../AXL" && pwd)"

mkdir -p "$ROOT/n1" "$ROOT/n2" "$ROOT/n3"
cp -u "$SRC_AXL/node" "$ROOT/node"
chmod +x "$ROOT/node"

[[ -f "$ROOT/n1/private.pem" ]] || cp "$SRC_AXL/private.pem" "$ROOT/n1/private.pem"
[[ -f "$ROOT/n2/private.pem" ]] || openssl genpkey -algorithm ed25519 -out "$ROOT/n2/private.pem"
[[ -f "$ROOT/n3/private.pem" ]] || openssl genpkey -algorithm ed25519 -out "$ROOT/n3/private.pem"

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
  "tcp_port": 7000,
  "a2a_addr": "http://127.0.0.1",
  "a2a_port": 9014
}
JSON

cat > "$ROOT/n3/node-config.json" <<'JSON'
{
  "PrivateKeyPath": "private.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9022,
  "tcp_port": 7000,
  "a2a_addr": "http://127.0.0.1",
  "a2a_port": 9024
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
start_node n3 9022

echo "Waiting for peering ..."
peer_count() {
  curl -s "http://127.0.0.1:$1/topology" \
    | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("peers",[])))' 2>/dev/null \
    || echo 0
}

for _ in $(seq 1 30); do
  a=$(peer_count 9002); b=$(peer_count 9012); c=$(peer_count 9022)
  if [[ "$a" -ge 2 && "$b" -ge 1 && "$c" -ge 1 ]]; then
    echo "Peered: n1 sees $a, n2 sees $b, n3 sees $c"
    exit 0
  fi
  sleep 0.5
done
echo "ERROR: peering did not converge"
exit 1
