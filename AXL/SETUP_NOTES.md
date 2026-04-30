# AXL Setup & Verification Notes

Local verification of the prebuilt `node` binary in this directory. Tested on
Windows host running WSL2 (Ubuntu 22.04).

## What I verified works

- Single-node startup with the prebuilt Linux binary (`./node`)
- HTTP API on `127.0.0.1:9002` — `GET /topology` returns ipv6 / pubkey / peers
- Two-node peering over TLS on `127.0.0.1:9001`
- Topology converges: each node lists the other as a peer
- `POST /send` + `GET /recv` round-trip in **both directions** with raw bytes
- Empty `/recv` correctly returns `204 No Content`

I did not verify `/mcp/...` or `/a2a/...`; those need a Python MCP/A2A
server attached (see [docs/integrations.md](docs/integrations.md) and
[examples/](examples/)).

## Environment requirements

- The `node` binary in this folder is **Linux ELF x86-64**. It will not run on
  native Windows. Run it from WSL (or any Linux/macOS environment).
- For peering, no Go toolchain is needed — the binary is prebuilt.
- `openssl` is only needed if you want a persistent identity (otherwise a
  random one is generated each start).

## Important config gotchas

The `node-config.json` shipped in this repo currently contains:

```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://0.0.0.0:9001"],
  "API": { "Listen": "127.0.0.1:8080" }
}
```

The `"API": { "Listen": ... }` field is **not** in the schema understood by
[cmd/node/config.go](cmd/node/config.go) and is silently ignored. Effective
result: the API binds to the default `127.0.0.1:9002`, **not** `:8080`.

The documented fields (all top-level, snake_case) are:

| Field | Default | Purpose |
|---|---|---|
| `api_port` | `9002` | HTTP API listen port |
| `bridge_addr` | `127.0.0.1` | HTTP API bind address |
| `tcp_port` | `7000` | gVisor-internal TCP port (see warning below) |
| `router_addr` / `router_port` | empty / `9003` | optional MCP router |
| `a2a_addr` / `a2a_port` | empty / `9004` | optional A2A server |

### `tcp_port` must match across all peers

The sender connects to the destination's gVisor virtual TCP port at a
fixed number. If two peers use different `tcp_port` values, `/send` returns:

```
502 Bad Gateway
Failed to reach peer: ... connect tcp [<dest-ipv6>]:<port>: connection was refused
```

Use the same `tcp_port` (the default `7000`) on every node in the network.

This is a **virtual** port inside each node's gVisor stack — not a host port —
so two nodes on the same machine can both use `tcp_port: 7000` without
conflicting.

## Quick reproduction (two nodes on one machine, in WSL)

```bash
mkdir -p ~/axl-test/n1 ~/axl-test/n2
cp /path/to/AXL/node ~/axl-test/node
chmod +x ~/axl-test/node
cp /path/to/AXL/private.pem ~/axl-test/n1/private.pem
openssl genpkey -algorithm ed25519 -out ~/axl-test/n2/private.pem
```

`~/axl-test/n1/node-config.json` (listener):
```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
```

`~/axl-test/n2/node-config.json` (peer):
```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
```

Start them in two terminals:
```bash
cd ~/axl-test/n1 && ../node -config node-config.json    # terminal 1
cd ~/axl-test/n2 && ../node -config node-config.json    # terminal 2
```

`n1` logs `Connected inbound: <n2-ipv6>...` and `n2` logs
`Connected outbound: <n1-ipv6>...` — peering is up.

## Quick API smoke test

```bash
# topology
curl -s http://127.0.0.1:9002/topology
curl -s http://127.0.0.1:9012/topology

# Take pubkeys from the responses above:
N1_PK=<n1 our_public_key>
N2_PK=<n2 our_public_key>

# send n2 -> n1
curl -i -X POST http://127.0.0.1:9012/send \
  -H "X-Destination-Peer-Id: $N1_PK" \
  --data-binary "hello-from-n2"

# pull on n1
curl -i http://127.0.0.1:9002/recv     # 200 OK + body
curl -i http://127.0.0.1:9002/recv     # 204 No Content (drained)
```

Expected on the first `/recv`:

```
HTTP/1.1 200 OK
Content-Type: application/octet-stream
X-From-Peer-Id: <hex>
Content-Length: 13

hello-from-n2
```

Note: `X-From-Peer-Id` is the lower-bits-padded form of the source pubkey
(the IPv6 only carries a prefix of the key), so the suffix shows up as
repeated `f`s. The first ~32 hex chars match the sender's `our_public_key`.

## Going public (a node reachable from the internet)

1. Pick a TCP port (e.g. `9001`) and forward / open it to the host.
2. Set `"Listen": ["tls://0.0.0.0:9001"]` in `node-config.json`.
3. Other nodes peer with `"Peers": ["tls://<your-ip>:9001"]`.
4. Optionally pass `-listen tls://0.0.0.0:9001` on the CLI (overrides config).

The node never needs inbound on the API port (`9002`) — that stays bound to
`127.0.0.1` by default for local apps to talk to it.
