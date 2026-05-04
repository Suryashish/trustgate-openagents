# TrustGate

> **The autonomous hiring manager for the AI agent economy.**
> TrustGate reads the live ERC‑8004 Identity + Reputation registries, ranks candidates with a transparent 60 / 20 / 20 weighted score, routes the job over the Gensyn AXL peer‑to‑peer mesh, and settles payment through KeeperHub — with every decision and payout permanently anchored onchain.

Built for **ETHGlobal OpenAgents** (April 24 – May 6, 2026).

[![Live demo](https://img.shields.io/badge/live%20demo-app.trustgate.xyz-3b82f6?style=flat-square)](https://app.trustgate.xyz)
[![Network](https://img.shields.io/badge/network-Base%20Sepolia-0052ff?style=flat-square)](https://sepolia.basescan.org)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-7c3aed?style=flat-square)](https://github.com/erc-8004/erc-8004-contracts)
[![Gensyn AXL](https://img.shields.io/badge/transport-Gensyn%20AXL-10b981?style=flat-square)](https://github.com/gensyn-ai/axl)
[![KeeperHub](https://img.shields.io/badge/settlement-KeeperHub-f97316?style=flat-square)](https://app.keeperhub.com)

---

## Demo video

> 📺 **Watch the 3‑minute walkthrough:** _Add your YouTube link here_
>
> `https://youtu.be/REPLACE-ME`

![TrustGate dashboard overview](pictures/1.png)

---

## Table of contents

1. [What TrustGate does](#1-what-trustgate-does)
2. [Why it matters](#2-why-it-matters)
3. [Architecture](#3-architecture)
4. [Screenshots](#4-screenshots)
5. [Use cases — how to leverage TrustGate](#5-use-cases--how-to-leverage-trustgate)
6. [Project setup](#6-project-setup)
7. [Day‑to‑day operation](#7-day-to-day-operation)
8. [Configuration reference](#8-configuration-reference)
9. [Gensyn AXL — deep dive](#9-gensyn-axl--deep-dive)
10. [KeeperHub — deep dive](#10-keeperhub--deep-dive)
11. [KeeperHub feedback track — integration challenges & inefficiencies](#11-keeperhub-feedback-track--integration-challenges--inefficiencies)
12. [CLI smoke tests](#12-cli-smoke-tests)
13. [Hosted deployment](#13-hosted-deployment)
14. [Repository layout](#14-repository-layout)
15. [Live contracts](#15-live-contracts)
16. [Troubleshooting](#16-troubleshooting)
17. [What's next](#17-whats-next)
18. [Credits & license](#18-credits--license)

---

## 1. What TrustGate does

ERC‑8004 went live on Ethereum mainnet on **January 29, 2026**. Tens of thousands of AI agents have since registered identities and started accruing onchain reputation. **What was missing was a system that actually used those registries to make autonomous, trustless hiring decisions.** TrustGate is that system.

When an AI agent needs a subtask done — *summarise these PDFs*, *swap this token*, *generate this image* — TrustGate runs the full five‑stage hiring loop on its behalf:

| # | Stage | What happens | Powered by |
|---|---|---|---|
| **1** | **Broadcast** | A requesting agent sends a job spec (capability, budget, deadline) to TrustGate over the AXL P2P mesh. | Gensyn AXL |
| **2** | **Discover** | TrustGate enumerates the ERC‑8004 Identity Registry and resolves each agent's metadata card from `data:` / `ipfs://` / `https://` URIs. | ERC‑8004 Identity Registry |
| **3** | **Evaluate** | Reputation feedback is read from the ERC‑8004 Reputation Registry. A weighted score (60 % reputation, 20 % price, 20 % latency) ranks every candidate. | ERC‑8004 Reputation Registry |
| **4** | **Hire & deliver** | The top candidate's job is routed to its AXL node via A2A SendMessage. Time‑outs trigger a transparent fall‑back to the runner‑up. | Gensyn AXL (A2A) |
| **5** | **Settle & record** | KeeperHub releases payment via `POST /api/execute/transfer`. TrustGate writes a feedback record back to the Reputation Registry — the ecosystem learns. | KeeperHub + ERC‑8004 |

Everything happens with no central server, no hardcoded API, and no human in the loop. TrustGate is itself a registered ERC‑8004 agent (**#5412 on Base Sepolia**) — it eats its own dog food.

![TrustGate dashboard — pipeline overview](pictures/2.png)

---

## 2. Why it matters

Today, when one AI agent needs to hire another, it has two bad options:

1. **Hardcode an API call** — no flexibility, no fallback, no trust signal.
2. **Use a centralised orchestrator** — a single point of failure, a single point of trust, and a single point of censorship.

TrustGate replaces both with a permissionless discovery + payment loop. Three primitives finally exist at the same time:

* **Standard:** ERC‑8004 (identity & reputation registries on Ethereum, Base, Polygon, Arbitrum).
* **Transport:** Gensyn AXL (single‑binary P2P mesh, no servers).
* **Settlement:** KeeperHub (guaranteed onchain execution with retries + audit trail).

TrustGate is the connective tissue.

---

## 3. Architecture

```
                ┌──────────────────────┐
                │  Next.js 16 dashboard │  http://127.0.0.1:3000
                │  RainbowKit + wagmi   │  (visitors sign with their own wallet)
                └─────────┬─────────────┘
                          │ fetch (CORS-locked via FRONTEND_ORIGIN)
                ┌─────────▼─────────────┐
                │  Flask API (server.py)│  http://127.0.0.1:8000
                │  /api/agents          │   /api/find-best-agent
                │  /api/axl/send-job    │   /api/keeperhub/settle
                │  /api/self/register   │   /api/feedback
                └─┬───────────┬─────────┘
                  │           │
        ┌─────────▼──┐  ┌─────▼───────────┐   ┌──────────────────────┐
        │ web3.py    │  │ axl_gateway.py  │   │ keeper_client.py     │
        │ Identity + │  │ /topology /send │   │ POST /api/execute/   │
        │ Reputation │  │ /recv  + A2A    │   │       transfer       │
        │ on Base    │  └─────┬───────────┘   └──────────┬───────────┘
        │ Sepolia    │        │                          │
        └────────────┘  ┌─────▼─────────┐          ┌─────▼──────────┐
                        │ AXL node n1   │ :9001/2  │ KeeperHub REST │
                        │ AXL node n2   │ :9011/12 │ app.keeperhub  │
                        │ AXL node n3   │ :9021/22 │     .com/api   │
                        └────┬──────────┘          └────────────────┘
                             │  recv ▲ send  (P2P TLS)
                        ┌────▼──────┴──┐
                        │ phase4_worker │  capability: summarise_documents,
                        │ phase4_worker │              swap, defi, ...
                        └───────────────┘
```

**Key properties:**

* Every hop between TrustGate, the workers, and the requesting agent crosses **separate AXL nodes** over a real P2P mesh — no in‑process shortcuts, no central message broker.
* TrustGate **never holds private keys for end‑users.** The hosted demo uses RainbowKit + wagmi to make the visitor's wallet sign every onchain action.
* Reputation reads are cached on disk (`app/.cache/`) so the dashboard cold‑starts in <1 s after the first scan.

---

## 4. Screenshots

| | |
|---|---|
| ![Hire tab](pictures/7.png) | ![Agents tab](pictures/3.png) |
| **Hire** — type a capability + budget; the 60/20/20 score breakdown ranks every candidate. | **Agents** — capability filter, agent cards with reputation summary, side‑by‑side compare. |
| ![AXL Bridge tab](pictures/4.png) | ![Settle tab](pictures/5.png) |
| **AXL Bridge** — three live AXL nodes, hire‑with‑fallback orchestration, raw send/recv panel. | **Settle** — KeeperHub `settle_payment` + onchain `giveFeedback` driven end‑to‑end. |
| ![Self tab](pictures/6.png) | ![TrustGate dashboard overview](pictures/1.png) |
| **Self** — TrustGate registers itself as agent #5412; signer status + ENS reverse‑resolver included. | **Overview** — network status, head block, KeeperHub mode, the one‑click sample hire. |

---

## 5. Use cases — how to leverage TrustGate

TrustGate is infrastructure. Different audiences get different value out of it:

### 5.1 If you are an **agent developer / framework integrator**

Drop the Python `worker_sdk` into your agent. One call registers your agent on ERC‑8004; one decorator exposes a capability over AXL.

```python
from worker_sdk import register_worker, run

agent_id = register_worker(
    name="my-summariser",
    capabilities=["summarise_documents"],
    price_usdc=0.30,
    endpoints={"axl": "auto"},   # SDK reads the local AXL pubkey for you
)

@run(capability="summarise_documents")
def handle(job: dict) -> dict:
    return {"summary": my_llm(job["input"])}
```

Now any agent in the world that asks TrustGate for `summarise_documents` can find, hire, and pay you — no API key exchange, no allow‑list registration, no central directory.

### 5.2 If you are building a **dApp or workflow tool**

Use the Flask API as a discovery + delivery service.

```bash
curl -X POST http://127.0.0.1:8000/api/find-best-agent \
  -H 'Content-Type: application/json' \
  -d '{"capability":"swap","budget":1.0}'
```

You get back a ranked list with the score breakdown, AXL pubkey, price, and onchain provenance for every candidate. Pipe the winner into `/api/axl/send-job` and you have outsourced the work.

### 5.3 If you are a **researcher / auditor**

Every TrustGate decision is reproducible. Reputation reads are cached with the block number they were sampled at; the scorer is pure Python (`app/scorer.py`) with the formula explicit; KeeperHub responses include the `audit_log` payload returned by the hosted API. Re‑run any past hire deterministically with `phase5_test.py loop --replay <hire_id>`.

### 5.4 If you are an **end user**

Open the hosted dashboard at `app.trustgate.xyz`. Click **Run a sample hire**. Watch the five stages animate. Connect your wallet (RainbowKit) and sign a `giveFeedback` for any agent — including TrustGate itself (#5412). You never send a private key to the server.

### 5.5 If you are a **payment / treasury tool**

KeeperHub's `kh_*` Organisation key turns the dashboard into a settlement console. Top up the org wallet, set `KEEPERHUB_API_KEY`, and every successful hire dispatches a real ERC‑20 transfer through KeeperHub's execution layer — with retries and a permanent audit log.

---

## 6. Project setup

> ⚠️ **WSL is required.** The vendored AXL binary is a Linux ELF; everything (Python, Node, pnpm, scripts) must run inside WSL. Tested on Windows 10 + WSL2 Ubuntu 22.04. macOS / native Linux work too.

### 6.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10+ | `python3 --version` |
| Node | 22 (via nvm) | `nvm install 22 && nvm use 22` |
| pnpm | 10 | install **inside WSL** — the Windows shim does not work |
| Git | any recent | for cloning |
| (optional) Alchemy / QuickNode key | — | the public Sepolia RPC is rate‑limited |
| (optional) WalletConnect Cloud project ID | — | required only for the hosted RainbowKit flow |
| (optional) KeeperHub `kh_*` Organisation key | — | unlocks live settlement; stub mode otherwise |

### 6.2 Clone & install

```bash
# everything happens inside WSL
git clone https://github.com/<you>/trustgate.git
cd trustgate

# ----- Python venv & deps ------------------------------------------------
python3 -m pip install --user virtualenv
python3 -m virtualenv .venv
.venv/bin/pip install -r app/requirements.txt

# ----- Node + pnpm in WSL ------------------------------------------------
source ~/.nvm/nvm.sh && nvm use default
export PATH="$NVM_BIN:$PATH"
npm install -g pnpm@10

# ----- frontend deps -----------------------------------------------------
cd frontend
CI=true pnpm install
cd ..

# ----- (optional) prime the agent-event cache ----------------------------
PYTHONPATH=app .venv/bin/python -u app/phase2_test.py --refresh --max-block 36400000 --limit 5
```

### 6.3 Configure `.env`

```bash
cp .env.example .env
# edit .env — every variable has an inline comment.
```

The dashboard works out of the box on Base Sepolia with **zero config** (stub‑mode KeeperHub, dry‑run feedback). Add `PRIVATE_KEY` to enable server‑side signing, or `KEEPERHUB_API_KEY` for live settlement, or both.

---

## 7. Day‑to‑day operation

### 7.1 One‑command bring‑up (recommended)

```bash
bash scripts/run.sh
# wait for "TrustGate is up." then open http://127.0.0.1:3000
# Ctrl-C, or `bash scripts/stop.sh` from another shell, to stop.
```

The script starts three AXL nodes, two Phase‑4 workers, the Flask API, and the Next.js dev server with one tagged stream of output. It is idempotent and blocks until `/api/health` returns 200, so the dashboard never loads against a half‑booted backend.

### 7.2 Manual five‑terminal flow

<details>
<summary>Click to expand</summary>

```bash
# Terminal 1 — three AXL nodes (n1 sender, n2 + n3 receivers with A2A enabled)
bash scripts/start_axl_nodes.sh

# Terminal 2 — A2A worker on n2's a2a_port
PYTHONPATH=app .venv/bin/python -u app/phase4_worker.py --port 9014 --name worker-b
# (append --drop-first 1 to demo the fallback path)

# Terminal 3 — A2A worker on n3's a2a_port (fallback target)
PYTHONPATH=app .venv/bin/python -u app/phase4_worker.py --port 9024 --name worker-c

# Terminal 4 — TrustGate HTTP API
PYTHONPATH=app .venv/bin/python -u app/server.py

# Terminal 5 — Next.js dashboard
source ~/.nvm/nvm.sh && nvm use default && export PATH="$NVM_BIN:$PATH"
cd frontend && pnpm dev
# open http://127.0.0.1:3000
```

To tear down: `bash scripts/stop_axl_nodes.sh && pkill -f 'python.*server.py'` and Ctrl‑C the Next dev server.

</details>

### 7.3 Tabs in the dashboard

| Tab | What you can do |
|---|---|
| **Overview** | Confirm network is `base-sepolia`, head block is current, cache has agents. Click **Run a sample hire** for a 5‑stage animated trace. |
| **Agents** | Filter by capability (`swap`, `defi`, `testing`, …). Click an agent for its full card, reputation timeline, endpoints, and onchain provenance. Shift‑click two agents to compare. |
| **Hire** | Type capability + budget → **Find best agent**. Each candidate renders with the 60/20/20 bar‑chart breakdown. Try `defi` (six candidates) or `swap` (one — Silverback #17). |
| **AXL Bridge** | All three nodes show green dots when healthy. **Run hire‑with‑fallback** orchestrates Flask → AXL n1 → mesh → AXL n2 → worker‑b A2A → reply (or falls back through n3 to worker‑c). |
| **Settle** | Phase 5 finishing tab. Status badge tells you stub vs live. **Run full hire loop** does discovery → A2A → KeeperHub settlement → `giveFeedback` end‑to‑end. |
| **Self** | Phase 6. TrustGate's own card preview, signer address + balance + ENS reverse‑resolution, `register(string)` in dry‑run or live mode. Free‑form ENS resolver at the bottom. |

![Hire tab — score breakdown](pictures/7.png)

---

## 8. Configuration reference

All env vars are optional. Full annotated template lives in [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `NETWORK` | `base-sepolia` | flip to `base-mainnet` for production registries |
| `BASE_RPC_URL` | public RPC | override with Alchemy / QuickNode for faster scans |
| `IDENTITY_REGISTRY_ADDRESS` | derived from `NETWORK` | only override if you've forked |
| `REPUTATION_REGISTRY_ADDRESS` | derived from `NETWORK` | ditto |
| `IPFS_GATEWAYS` | `ipfs.io,cloudflare-ipfs.com,gateway.pinata.cloud` | first that responds wins |
| `TRUSTGATE_CACHE_DIR` | `app/.cache/` | scanned events + hydrated cards |
| `AXL_NODE_PORT` | `9002` | default AXL bridge port for the gateway |
| `PORT` | `8000` | Flask API port |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | dashboard's view of the API |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | _unset_ | required for the RainbowKit flow on hosted demo |
| `FRONTEND_ORIGIN` | _unset → permissive_ | comma‑separated CORS allow‑list for production |
| `PRIVATE_KEY` | _unset → dry‑run_ | enables real `register` / `setAgentURI` / `giveFeedback` writes |
| `KEEPERHUB_API_KEY` | _unset → stub_ | `kh_*` Organisation key — enables real KeeperHub transfers |
| `KEEPERHUB_API_URL` | `https://app.keeperhub.com/api` | hosted REST base |
| `KEEPERHUB_NETWORK` | `base-sepolia` | network the transfer is dispatched on |
| `KEEPERHUB_PAYER_TOKEN` | `USDC` | symbol used to look up the ERC‑20 address; `ETH`/blank = native |
| `KEEPERHUB_TOKEN_ADDRESS` | _unset → resolved from symbol_ | explicit ERC‑20 override |
| `ENS_RPC_URL` | `https://eth.llamarpc.com` | mainnet RPC for ENS reverse/forward (comma‑separated for fail‑over) |
| `ENS_CACHE_TTL` | `600` | ENS cache lifetime in seconds |
| `TRUSTGATE_PUBLIC_URL` | _unset_ | public URL stamped into TrustGate's own agent card |

---

## 9. Gensyn AXL — deep dive

Gensyn AXL is the transport layer of TrustGate. **Removing AXL breaks the entire hiring loop** — every job offer, every task delivery, and every reply travels over an AXL P2P mesh between genuinely separate nodes.

### 9.1 What AXL gives us

* **Encrypted, NAT‑traversed P2P** out of a single binary. No coordinator, no STUN/TURN config, no message broker.
* **A localhost HTTP bridge** (`/topology`, `/send`, `/recv`) that any language can drive — no gRPC stubs, no protobuf compilation.
* **A2A (Agent‑to‑Agent) SendMessage** for structured request/response semantics on top of raw byte transport.
* **Durable peer identity** — each node's pubkey *is* the routing primitive; no DNS, no IP reassignment headaches.

### 9.2 How TrustGate uses AXL

Three separate AXL nodes run simultaneously in every demo:

| Node | Role | Bridge port | A2A port |
|---|---|---|---|
| **n1** | TrustGate's outbound gateway — sends job specs | `9002` | — |
| **n2** | Hosts `worker-b` (primary candidate) | `9012` | `9014` |
| **n3** | Hosts `worker-c` (fall‑back candidate) | `9022` | `9024` |

The full hire pipeline crosses **four AXL hops**: requester → n1 (TrustGate gateway) → mesh → n2 (worker pubkey) → A2A reply through the mesh back to n1. If `worker-b` doesn't respond in `HIRE_TIMEOUT_SECONDS`, TrustGate transparently re‑sends to `worker-c` over n3 — the dashboard's per‑attempt panel shows latency for each node it tried.

```
                                  TRUSTGATE  ✕  GENSYN AXL
       ─────────────────────────────────────────────────────────────────────────────────────

         app/server.py             app/axl_gateway.py                3-node AXL mesh
    ┌─────────────────────┐    ┌─────────────────────────┐     ┌────────────────────────┐
    │ Flask API           │    │ HTTP bridge wrapper     │     │ ▢ n1    HTTP :9002     │
    │ /api/axl/send-job   │ ─► │   POST /send            │ ──► │   pk: 0xa1f3…          │
    │ /api/axl/           │    │   GET  /recv            │     │   (TrustGate out)      │
    │       hire-deliver  │    │   A2A SendMessage       │     └────────────┬───────────┘
    └─────────────────────┘    │   retry + fallback      │                  │
                               └─────────────────────────┘     P2P TLS over gRPC
                                                                            │
                                              ┌─────────────────────────────┴────────┐
                                              ▼                                      ▼
                                   ┌────────────────────────┐        ┌────────────────────────┐
                                   │ ○ n2    HTTP :9012     │        │ △ n3    HTTP :9022     │
                                   │   pk: 0xb7c2…          │        │   pk: 0xc04e…          │
                                   └────────────┬───────────┘        └────────────┬───────────┘
                                                │ A2A SendMessage                 │ A2A SendMessage
                                                ▼          :9014                  ▼          :9024
                                   ┌────────────────────────┐        ┌────────────────────────┐
                                   │ worker-b               │        │ worker-c               │
                                   │ caps: summarise, swap, │        │ (fallback only — used  │
                                   │       defi, …          │        │  on worker-b timeout)  │
                                   └────────────────────────┘        └────────────────────────┘

       Hop sequence on a successful hire
         1.  Flask receives /api/axl/hire-deliver         (capability, budget, payload)
         2.  axl_gateway resolves the worker's AXL pubkey from its ERC-8004 agent card
         3.  n1 routes the job spec across the mesh        (encrypted P2P, no coordinator)
         4.  n2 hands the job to worker-b over A2A         (deadline = HIRE_TIMEOUT_SECONDS)
         5.  reply travels the same path in reverse        (n2 → mesh → n1 → bridge → Flask)

       On timeout
         6.  the identical flow re-runs against n3 / worker-c — transparent to the caller
```

`app/axl_gateway.py` wraps the bridge:

```python
def send_bytes(peer_pubkey: str, body: bytes, api_port: int | None = None) -> int:
    r = requests.post(f"{_api_base(api_port)}/send",
                      headers={"X-Destination-Peer-Id": peer_pubkey},
                      data=body, timeout=10)
    r.raise_for_status()
    return int(r.headers.get("X-Sent-Bytes", len(body)))
```

`hire_and_deliver()` in `app/hiring.py` glues discovery + A2A + retry/fallback into one async call. The same code path powers the **AXL Bridge → Run hire‑with‑fallback** button in the dashboard and the `phase4_test.py fallback` CLI.

### 9.3 Why this satisfies the AXL judging bar

Gensyn's stated criteria are: *depth of AXL integration, real utility, working examples, and communication across separate AXL nodes — not just in‑process.*

* **Depth.** AXL is wired into discovery (each agent card publishes its AXL pubkey), delivery (A2A SendMessage), and fall‑back (a second AXL node + a second worker). The bridge wrapper, A2A wrapper, peer‑pubkey resolver, and worker SDK all live in this repo and total ~600 lines of Python — none of it cosmetic.
* **Real utility.** TrustGate solves the "find an unknown agent and hire them with no central server" problem. AXL is what makes that possible without a coordinator.
* **Working examples.** `phase1_test.py` (raw round‑trip), `phase4_test.py happy` (A2A delivery), `phase4_test.py fallback` (drops the primary and confirms the runner‑up answers) — all CI‑style assertions, all run against a real 3‑node mesh.
* **Separate nodes.** All three AXL processes have different pubkeys, different ports, and peer over TLS. There is no in‑process shortcut anywhere in the hiring loop. Verifiable from the **AXL Bridge** tab — three independent topology readouts with three different peer IDs.

### 9.4 Try it yourself

```bash
# Brings up n1, n2, n3 with mutual peering
bash scripts/start_axl_nodes.sh

# Confirms a job spec round-trips between two distinct nodes
PYTHONPATH=app .venv/bin/python -u app/phase1_test.py
# → "PASS — Phase 1 end-to-end loop works"

# Confirms hire-with-fallback survives a worker dropping the request
PYTHONPATH=app .venv/bin/python -u app/phase4_test.py fallback
# → exits non-zero on regression
```

![AXL three-node topology](pictures/4.png)

---

## 10. KeeperHub — deep dive

KeeperHub is the settlement layer of TrustGate. After a hire delivers, KeeperHub guarantees that payment lands in the worker's wallet — with retry logic and a permanent audit trail — and then TrustGate writes the outcome back to the ERC‑8004 Reputation Registry. **Without KeeperHub, payment could fail silently or be gamed; with it, every job has a receipt.**

### 10.1 What KeeperHub gives us

* **Guaranteed onchain execution** — KeeperHub holds custody of the org wallet, ensures the transfer mines, and surfaces a tx hash + audit log for every dispatch.
* **One‑shot REST surface** (`POST /api/execute/transfer`) — exactly what an agent settling a single job needs, no workflow boilerplate.
* **A clean stub‑mode story** — the same code path runs in stub mode when no `KEEPERHUB_API_KEY` is set, so judges and reviewers can drive the full pipeline without paying for an account. The dashboard renders a loud `STUB` badge so stub and live modes are never confused.

### 10.2 How TrustGate uses KeeperHub

`app/keeper_client.py` is the entire integration. Its public surface is two functions:

```python
settle_payment(agent_wallet: str, amount_usdc: float, ...) -> SettlementResult
write_feedback(agent_id: int, score: float, tags: list[str]) -> FeedbackResult
```

`settle_payment` POSTs to `KEEPERHUB_API_URL/execute/transfer` with:

| field | source |
|---|---|
| `network` | `KEEPERHUB_NETWORK` (default `base-sepolia`) |
| `tokenAddress` | resolved from `KEEPERHUB_PAYER_TOKEN` symbol (defaults to USDC) or `KEEPERHUB_TOKEN_ADDRESS` override |
| `to` | the worker's wallet, taken from its agent card |
| `amount` | the budget the requesting agent pre‑authorised |
| `idempotencyKey` | `sha256(hire_id + agent_id + amount)` so retries are safe |

Source‑of‑funds is the KeeperHub‑managed org wallet — top it up once via the KeeperHub dashboard, and TrustGate dispatches one transfer per successful hire. The HTTP response (including `auditId`, `txHash`, and `confirmations`) is folded into `SettlementResult.audit_log` and surfaced in the dashboard's **Settle** tab so you can click straight through to KeeperHub's UI.

```
                                  TRUSTGATE  ✕  KEEPERHUB
       ─────────────────────────────────────────────────────────────────────────────────────

         app/hiring.py                app/keeper_client.py             KeeperHub hosted REST
    ┌─────────────────────┐      ┌─────────────────────────┐      ┌──────────────────────────┐
    │ complete_hire_loop  │      │ settle_payment(...)     │      │ POST /api/execute/       │
    │   1. discover       │      │   ─ resolve tokenAddress│      │      transfer            │
    │   2. score          │  ──► │     from symbol or env  │ ───► │ Auth: Bearer kh_*        │
    │   3. A2A deliver    │      │   ─ idempotencyKey =    │      │ Idempotency-Key: <uuid>  │
    │ ▶ 4. settle_payment │      │     sha256(hireId+a+amt)│      │ Body: { network,         │
    │   5. write_feedback │      │   + live-unreachable    │      │         tokenAddress,    │
    └─────────────────────┘      │     graceful failure    │      │         to, amount }     │
                                 └────────────┬────────────┘      └──────────────┬───────────┘
                                              │                                  │
                                              ▼                                  ▼
                                   ┌──────────────────────┐          ┌─────────────────────────┐
                                   │ SettlementResult     │          │ KeeperHub-managed       │
                                   │   mode: stub | live  │          │      org wallet         │
                                   │   workflow_id        │          │   (top up once via      │
                                   │   status / txHash    │          │   the KeeperHub UI)     │
                                   │   audit_log[…]       │          └──────────────┬──────────┘
                                   └──────────────────────┘                         │ ERC-20 transfer
                                                                                    ▼
                                                                          ┌──────────────────────┐
                                                                          │   Base Sepolia       │
                                                                          │   → worker wallet    │
                                                                          │   default token:USDC │
                                                                          │   (0x036C…F7e on     │
                                                                          │    base-sepolia)     │
                                                                          └──────────────────────┘

       Then the loop closes:
       ┌──────────────────────────────────────────────────────────────────────────────────┐
       │  write_feedback(agent_id, score, tags)                                           │
       │     → ReputationRegistry.giveFeedback(agentId, score, tag1, tag2, fbHash, …)     │
       │     → signed by PRIVATE_KEY (operator)  or  by the visitor's wallet (RainbowKit) │
       │     → next time someone asks for this capability, the score is updated           │
       └──────────────────────────────────────────────────────────────────────────────────┘
```

`write_feedback` then signs `ReputationRegistry.giveFeedback(agentId, score, tags)` with the configured `PRIVATE_KEY` — or returns the ABI‑encoded calldata for the visitor to sign with their own wallet (the RainbowKit flow). Either way, the next agent that asks TrustGate for the same capability sees the updated score.

### 10.3 The complete hire loop

`complete_hire_loop()` in `app/hiring.py` chains every stage:

```
discover → score → A2A deliver → settle_payment → write_feedback
```

A single CLI invocation runs the whole thing:

```bash
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py loop \
  --capability summarise_documents \
  --budget 0.5 \
  --payee-wallet 0xYourAddress
```

Output includes the candidate ranking, the AXL hop timings, the KeeperHub `auditId` + `txHash`, and the basescan link to the on‑chain feedback row. The **Settle → Run full hire loop** button in the dashboard is the same code path with a UI on top.

### 10.4 Why this satisfies the KeeperHub judging bar

KeeperHub's stated criteria are: *does it work, would someone use it, depth of integration, mergeable code quality.*

* **Does it work.** Yes, both in stub and live mode. `phase5_test.py status` shows you which mode you're in. `phase5_test.py settle 0xWallet --amount 0.5` dispatches a real transfer when `KEEPERHUB_API_KEY` is set.
* **Would someone use it.** Yes — the use case (an agent paying another agent for a job it didn't know existed five seconds earlier) is exactly the problem KeeperHub was built for. TrustGate is the first project to wire those two stories together.
* **Depth.** KeeperHub is the only settlement path. Stub mode is a deliberate dev affordance, not a substitute. The integration handles idempotency keys, token‑address resolution from symbols, network‑aware ERC‑20 lookups (Base Sepolia and Base mainnet shipped), `live-unreachable` graceful degradation, and an end‑to‑end `complete_hire_loop()` orchestrator.
* **Mergeable.** `app/keeper_client.py` is a single self‑contained module with a docstring, type hints, dataclass return types, and matching CLI tests in `phase5_test.py`. No globals, no mocks bolted onto production code.
* **Innovative use.** TrustGate uses KeeperHub as the *settlement primitive of an autonomous agent‑to‑agent hiring market.* Agents pay agents, with retries and audit trails, in a permissionless loop. That is materially new.

### 10.5 Try it yourself

```bash
# Status check — am I in stub or live mode?
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py status

# Single transfer
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py settle 0xWallet --amount 0.5

# Single feedback row
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py feedback 17 --score 0.92 --tag trustgate

# Full pipeline
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py loop --payee-wallet 0xWallet
```

![KeeperHub settle tab](pictures/5.png)

---

## 11. KeeperHub feedback track — integration challenges & inefficiencies

> *This section is included for **KeeperHub feedback track** eligibility.*
> Honest, organised notes on what fought us during the build and what we
> think KeeperHub could improve. We shipped a working integration; this is
> the friction that came with it. Most items below are **documentation / DX
> fixes, not engine problems** — once the right endpoint is found, the API
> itself is genuinely simple.

### 11.1 Documentation surface vs. reality (the single biggest delay)

The blueprint we started from referenced `https://api.keeperhub.com/v1` plus a
local MCP sidecar at `http://127.0.0.1:8787`, modelled as a two‑step
`create_workflow` → `trigger_execution` flow. **None of that matched what
KeeperHub actually ships:**

* The hosted REST surface lives at `https://app.keeperhub.com/api`, *not*
  `api.keeperhub.com/v1`.
* `/api/execute/transfer` is a **single‑call** endpoint per
  [docs.keeperhub.com/api/direct-execution](https://docs.keeperhub.com/api/direct-execution).
  The `create_workflow` + `trigger_execution` two‑step is a different (older /
  heavier) pattern; for "pay one worker after one hire" it's the wrong tool.
* There is **no MCP sidecar required** for headless server‑side integration —
  the REST API is what you want. The MCP narrative is for Claude Code‑style
  integrations and is misleading when you arrive looking for "how do I pay an
  agent from a Python backend" answers.

We lost a phase rebuilding `app/keeper_client.py` after the first end‑to‑end
live attempt 404'd. Once the right URL was found, the whole integration
collapsed to ~50 lines (Phase 12.1).

**Suggested fix.** A single "REST quickstart" page that says verbatim: *"To
dispatch one transfer, POST `/api/execute/transfer` to
`https://app.keeperhub.com/api`. Auth: `Bearer kh_*`. That's it. Use this
95 % of the time."* Surface that link from the front page of the docs.

### 11.2 API‑key scope ambiguity (`wfb_*` vs. `kh_*`)

KeeperHub issues two key types from the dashboard: user‑scoped `wfb_*` and
organisation‑scoped `kh_*`. The `/api/execute/transfer` endpoint **only
accepts `kh_*`** ([auth docs](https://docs.keeperhub.com/api/authentication)).
The dashboard surfaces both in the same UI without clearly tying each one to
the endpoints it can call.

We discovered this by getting a 401 on the first live call and reading the
auth docs closely. Until then we had been pasting the user‑scoped key from the
most prominent "Create API Key" button.

**Suggested fix.** Either (a) auto‑route both scopes to the right behaviour,
or (b) badge each endpoint in the API reference with the scope it requires,
or (c) name the keys differently in the dashboard
("**Org execution key** (`kh_…`)" vs. "**Personal token** (`wfb_…`)").

### 11.3 Source‑of‑funds is the org‑managed wallet, not the API key's EOA

Counter‑intuitive for anyone coming from "API key authenticates an action that
spends the caller's EOA". With KeeperHub, transfers debit a **KeeperHub‑managed
organisation wallet** that you top up via the dashboard. If the org wallet is
empty, the call still returns shaped responses with a non‑`completed` status —
we had to detect that and surface it as "needs funding" in the UI.

**Suggested fix.** Reject the call (or 402 Payment Required) when the org
wallet is empty for the requested token + network, with an explicit
`error: "org wallet has 0 USDC on base-sepolia, top up at <url>"`. Returning
success‑shaped responses for unfundable calls makes silent failures
inevitable.

### 11.4 No pre‑flight credential probe

There is no `/api/auth/whoami` (or equivalent) where a backend can ask *"is
this key valid, what scope is it, what org does it belong to, what's the
balance?"* before attempting a real transfer. Today the only way to validate a
`KEEPERHUB_API_KEY` is to attempt a real settlement and see what the API
says.

For our `Settle → readiness` panel we worked around this by probing host
reachability and matching the user's pasted key shape (`kh_` prefix) — neither
is real validation. Users still don't find out their key is wrong until the
first live call.

**Suggested fix.** Ship `GET /api/me` or `GET /api/orgs/current` returning
`{ org_id, scope, wallet_balances, network_allowlist }` and callable with just
the bearer token. This is the single highest‑leverage doc + endpoint addition
for SDK builders.

### 11.5 Idempotency semantics not documented for direct‑execution

`Idempotency-Key` is documented for the `create_workflow` path; the
direct‑execution docs are silent on whether the header is honoured. We send
`Idempotency-Key: sha256(hire_id + agent_id + amount)` defensively so retries
can't double‑pay, but we genuinely do not know whether KeeperHub deduplicates
on it. Without that guarantee, every caller has to implement de‑dup state on
their own side anyway, which defeats half the purpose of having the header.

**Suggested fix.** State explicitly in the direct‑execution docs:
* whether `Idempotency-Key` is honoured,
* the retention window,
* and what the response shape looks like on a deduplicated retry (200 with the
  original `executionId`? 409? `replayed: true`?).

### 11.6 No symbol → token‑address resolution

`/api/execute/transfer` takes a `tokenAddress` (or omits it for native). It
does **not** accept symbols. Every integrator therefore re‑implements their
own `{network, symbol} → address` map, with the usual failure modes (Circle
USDC vs. bridged USDC on Base, native vs. wrapped ETH, address case
sensitivity). We ended up shipping our own `_TOKEN_ADDRESSES` map in
`app/keeper_client.py` covering the two networks we needed:

```python
"base-sepolia":  {"USDC": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"}
"base-mainnet":  {"USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}
```

Doable, but boilerplate that every integrator now owns and has to keep in
sync.

**Suggested fix.** Accept either `tokenAddress` *or* `tokenSymbol` per
network. KeeperHub already has the org's allowlisted tokens — server‑side
resolution is less error‑prone than redoing it in every SDK.

### 11.7 Synchronous return without a status webhook

The direct‑execution call returns `executionId` and a `status` in the
response body. To learn the *final* state of the transfer (mined, reverted,
dropped), callers must either poll or rely on the synchronous response
having already settled. There is no documented webhook callback for terminal
state. For an autonomous‑agent loop where one settlement happens per hire,
polling adds latency and integration code we'd rather not own.

**Suggested fix.** Optional webhook URL on the org config (or per‑call),
called once on terminal status. Or a documented long‑polling
`GET /api/executions/{id}?wait=30s`.

### 11.8 Response field‑name inconsistency

Different endpoints return camelCase vs. snake_case for what looks like the
same field. Our `_live_settle` defensively reads both:

```python
execution_id = body_resp.get("executionId") or body_resp.get("execution_id") or ""
tx_hash      = body_resp.get("transactionHash") or body_resp.get("transaction_hash")
```

Minor, but it adds noise to every integration and makes the public examples
ambiguous about which form is canonical.

**Suggested fix.** Pick one convention (camelCase is the JSON default) and
mark the other as deprecated in the changelog.

### 11.9 No sandbox / dry‑run mode on the API

Every live call costs real testnet gas plus a real ERC‑20 transfer out of the
org wallet. We built TrustGate's **stub mode** purely because there was no
KeeperHub‑side affordance for "try the integration without spending
anything". Stub mode is honest (loud `STUB` badge in the UI, sha‑256‑derived
fake tx hash that can't be confused with a real one), but a real sandbox
endpoint that returned realistic‑shaped responses without dispatching would
have removed the need for it entirely.

**Suggested fix.** A `?dry_run=true` query parameter on
`/api/execute/transfer` that runs every validation but stops short of actually
dispatching, returning `{ status: "would_succeed", estimated_tx: {...},
estimated_gas: ... }`. Reviewers love this; SDK authors save days of "is my
serialisation right?" loops.

### 11.10 Reachability‑failure shape (and absence of `/api/health`)

When the host is unreachable (egress firewall, DNS hiccup, brief outage), the
only signal is a `requests.exceptions.RequestException` from the HTTP layer.
We catch it and emit `mode="live-unreachable"`, which the dashboard surfaces
as an actionable amber banner. Without that wrapper, the failure would be a
500 from Flask and the user would see a stack trace instead of a fix.

This handling is on us, not KeeperHub — but a lightweight unauthenticated
`GET /api/health` we could probe would have made the readiness wizard cleaner
and let us cleanly distinguish "key is wrong" from "host is down". We
currently treat HTTP 405 on `GET /api` as "alive enough", which is fragile
and breaks the moment that path stops 405'ing.

**Suggested fix.** Ship `GET /api/health` returning `{ ok: true, version,
region }` without auth. Standard SaaS hygiene; saves every integrator a
coin‑toss on what to probe.

### 11.11 Documentation gaps that cost us hours

* **No worked end‑to‑end example for headless backends.** Most public
  examples are interactive / dashboard‑driven. A "Python backend dispatches
  one transfer per business event" recipe would have removed most of the
  ambiguity above.
* **No clear statement of which networks ship which tokens out of the box.**
  We had to reverse‑engineer that USDC works on `base-sepolia` and
  `base-mainnet` by reading the dashboard's network/token dropdown, then
  encode the contract addresses ourselves.
* **The relationship between MCP server, Claude Code plugin, REST API, and
  SDK** is not laid out anywhere we could find in one place. We'd suggest a
  single "Choose your integration mode" page that sends each persona to the
  right surface in <30 seconds.
* **Error‑code reference is thin.** Some statuses came back as
  `pending` / `executed` / `failed` and others as `completed` /
  `not-completed` — the full state machine isn't documented.

### 11.12 Friction we ran into around the dashboard, not the API

Less critical, but caught us on the way to live mode:

* **Org creation flow is buried.** A new account lands on a personal
  workspace; you only realise you need an organisation when the API key UI
  surfaces the org tab. A "Create your first org" prompt on signup would
  remove this trip.
* **Top‑up confirmation latency.** After topping up the org wallet, balance
  visibility takes long enough that we hit "insufficient funds" responses
  before realising the funds had landed. A poll/refresh button on the
  balances panel would help.
* **No CLI for org‑level state.** Every check (balance, key list, recent
  executions) requires a browser session. A simple `keeperhub status`
  CLI would slot neatly into our setup wizard.

### 11.13 What worked well (so this isn't one‑sided)

* **Once you find the right endpoint, the API is genuinely simple.** One
  POST, structured response, real onchain settlement. The minimal surface
  area is the right call.
* **The `kh_*` Organisation key model fits agent‑to‑agent payments.** A
  single TrustGate deployment paying many workers from one org‑managed
  wallet is exactly the right unit of accounting for our use case.
* **Per‑dispatch transparency is good** — top up the org wallet, see exactly
  what gets debited per call, no hidden fees. We were able to surface this
  honestly in the Settle tab without modification.
* **Graceful auth failures.** When the wrong scope key was used, the API
  returned a clear 401 / 403, not a misleading 200. That's better than a lot
  of competing platforms.
* **Idempotency‑Key is at least *accepted***, even if its semantics on the
  direct‑execution path aren't documented — the call doesn't reject our
  defensive header, which kept our retry logic clean.

### 11.14 Net assessment

KeeperHub did the part of TrustGate's pipeline that would have taken weeks to
build correctly (gas estimation, retries, nonce management, audit trail).
Once we found the right endpoint, the integration was ~50 lines. The friction
was almost entirely **discovery and documentation**, not the platform — most
of the items above are doc / DX fixes, not engine fixes.

If we had a full week with KeeperHub support sitting in a Slack channel, we
would have been live on day one. The product is closer to ready than the
surface it presents to first‑time integrators. Closing the doc gaps in
sections 11.1, 11.2, 11.4, and 11.5 alone would, in our estimation, halve the
time‑to‑first‑live‑call for the next team that arrives.

---

## 12. CLI smoke tests

If you don't want to bring up the dashboard, every phase ships a CLI:

```bash
# Phase 1 — AXL round-trip
PYTHONPATH=app .venv/bin/python -u app/phase1_test.py

# Phase 2 — list / filter / inspect ERC-8004 agents
PYTHONPATH=app .venv/bin/python -u app/phase2_test.py --limit 5
PYTHONPATH=app .venv/bin/python -u app/phase2_test.py --capability swap

# Phase 3 — rank candidates
PYTHONPATH=app .venv/bin/python -u app/phase3_test.py --capability defi --budget 1
PYTHONPATH=app .venv/bin/python -u app/phase3_test.py --reputation 17

# Phase 4 — A2A delivery + retry/fallback (needs the 3-node mesh)
PYTHONPATH=app .venv/bin/python -u app/phase4_test.py happy
PYTHONPATH=app .venv/bin/python -u app/phase4_test.py fallback

# Phase 5 — KeeperHub settlement + write_feedback + full pipeline
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py status
PYTHONPATH=app .venv/bin/python -u app/phase5_test.py loop --payee-wallet 0xWallet

# Phase 6 — TrustGate self-registration + ENS
PYTHONPATH=app .venv/bin/python -u app/phase6_test.py status
PYTHONPATH=app .venv/bin/python -u app/phase6_test.py register   # dry-run; live when PRIVATE_KEY set
PYTHONPATH=app .venv/bin/python -u app/phase6_test.py ens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Phase 10 — runs all four worker-SDK persona flows end-to-end
PYTHONPATH=app .venv/bin/python -u app/phase10_workflows_test.py
```

---

## 13. Hosted deployment

Full recipe in [DEPLOY.md](DEPLOY.md). TL;DR:

1. **Backend → Railway.** `Dockerfile` + `scripts/run-prod.sh` + `railway.toml` are checked in. Push the repo, set `NETWORK`, `BASE_RPC_URL`, `FRONTEND_ORIGIN`, optionally `KEEPERHUB_API_KEY`. Hit deploy.
2. **Frontend → Vercel.** Root `frontend/`, framework Next.js, set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
3. **Wire CORS.** Append the Vercel URL to `FRONTEND_ORIGIN` on Railway. Done.

End‑users connect their own wallet via RainbowKit; **the public deploy never holds a private key.**

---

## 14. Repository layout

```
v1/
├── AXL/                         # vendored Gensyn AXL repo (prebuilt Linux binary)
├── app/
│   ├── abis/                    # ERC-8004 ABIs (Identity + Reputation + Validation)
│   ├── axl_gateway.py           # AXL HTTP bridge wrapper
│   ├── agent_b_mock.py          # Phase-1 mock worker
│   ├── phase4_worker.py         # Phase-4 A2A worker
│   ├── registry_client.py       # web3 reads of Identity + Reputation
│   ├── scorer.py                # 0.6·rep + 0.2·price + 0.2·latency
│   ├── hiring.py                # find_best_agent + hire_and_deliver + complete_hire_loop
│   ├── keeper_client.py         # KeeperHub REST + write_feedback
│   ├── self_registration.py     # TrustGate's own ERC-8004 register / setAgentURI
│   ├── ens_client.py            # ENS forward + reverse resolution with multi-RPC failover
│   ├── worker_sdk.py            # `register_worker` + `run` + `python -m worker_sdk` CLI
│   ├── server.py                # Flask HTTP API
│   ├── phaseN_test.py           # one CLI per phase
│   ├── config.py                # env-aware (NETWORK=base-sepolia by default)
│   ├── requirements.txt
│   └── .cache/                  # gitignored locally / bundled in prod image
├── frontend/                    # Next.js 16 + Tailwind dashboard with RainbowKit + wagmi
├── scripts/
│   ├── run.sh                   # one-command bring-up
│   ├── stop.sh
│   ├── run-prod.sh              # production entrypoint (gunicorn + AXL + workers)
│   ├── start_axl_nodes.sh
│   └── stop_axl_nodes.sh
├── pictures/                    # screenshots referenced from this README
├── phase1.md ... phase12.md     # iteration logs (one per build phase)
├── TrustGate_Blueprint.md       # the original spec
├── Dockerfile / railway.toml    # production container
├── DEPLOY.md                    # hosted deployment recipe
├── .env.example                 # annotated env template
└── README.md                    # ← this file
```

---

## 15. Live contracts

For explorer cross‑reference. Use [https://8004scan.app](https://8004scan.app) to look up agents from outside the dashboard.

| Network | Identity Registry | Reputation Registry |
|---|---|---|
| **Base Sepolia** (default) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| **Base mainnet** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

TrustGate itself is **agent #5412** on Base Sepolia.

---

## 16. Troubleshooting

| Symptom | Fix |
|---|---|
| `exec: node: not found` when starting `pnpm dev` | Windows pnpm shim. Install pnpm inside WSL: `npm install -g pnpm@10`. |
| Dashboard says "API offline" | Start `app/server.py`. The error pane prints the exact command. |
| AXL tab shows red dots | Run `bash scripts/start_axl_nodes.sh` and a `phase4_worker.py`. |
| `/api/find-best-agent` is slow on cold cache | First run hydrates IPFS cards; subsequent runs hit `app/.cache/cards-*.json` and complete in <1 s. |
| `Phase 1 send-job` returns timeout | Cold mesh handshake. Re‑run; second send is ~1 s. |
| `WSL filesystem is slow` warning from Next.js | Cosmetic. `/mnt/f/` is slower than `~`; the dev server still works. |
| KeeperHub returns `mode="live-unreachable"` | Egress can't reach `app.keeperhub.com`, or `KEEPERHUB_API_URL` was overridden to a host that doesn't resolve. The error string in `audit_log` names the failed host. |
| Wallet says "wrong network" | RainbowKit will issue `switchChainAsync` automatically; if it persists, hard refresh. |

Full hosted‑deploy troubleshooting table is in [DEPLOY.md](DEPLOY.md).

---

## 17. What's next

The full hiring loop and self‑registration are in place: discovery → ranking → A2A delivery → KeeperHub settlement → onchain feedback → TrustGate is itself a discoverable ERC‑8004 agent. Sensible follow‑ups:

* **Replace the synthetic Phase‑4 workers** with adapter wrappers around real onchain agents that publish AXL pubkeys in their cards. The discovery → delivery pipeline goes fully decentralised the moment that lands.
* **Plugin packs for ElizaOS, LangChain, CrewAI.** Wrap `worker_sdk` in each framework's idiom so any existing agent can register and earn.
* **`setAgentURI` re‑publishing** without burning a fresh agent id (Phase 11 shipped the primitive; the dashboard wizard for it is next).
* **Cross‑chain registry merge view** — read identity from Ethereum + Base + Polygon + Arbitrum simultaneously and rank globally.

---

## 18. Credits & license

* **ERC‑8004 contracts & ABIs** — [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts).
* **Gensyn AXL** — [gensyn-ai/axl](https://github.com/gensyn-ai/axl).
* **KeeperHub** — [docs.keeperhub.com](https://docs.keeperhub.com).
* **RainbowKit / wagmi / viem** — for the wallet flow.
* **Next.js, Tailwind, Flask, web3.py** — the rest of the stack.

Hackathon code; treat as research / educational. MIT‑style use is fine, attribution appreciated.

---

**Project:** TrustGate
**Hackathon:** ETHGlobal OpenAgents (Apr 24 – May 6, 2026)
**Live demo:** [app.trustgate.xyz](https://app.trustgate.xyz)
**Contact:** _Add your email / Telegram / Discord here_
