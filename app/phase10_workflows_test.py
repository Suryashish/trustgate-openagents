"""Phase 10 — persona workflow integration test.

Walks each of the four user personas through the workflow they actually use,
end-to-end against a running stack. Run after `bash scripts/run.sh`:

    PYTHONPATH=app .venv/bin/python -u app/phase10_workflows_test.py

Exits 0 only if every workflow completes cleanly. Each workflow is its own
function so the failure case is precise.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


API = "http://127.0.0.1:8000"
WORKER_SDK_HOST = "127.0.0.1"


# ---- low-level HTTP --------------------------------------------------------


def jget(url: str, *, body: dict | None = None, timeout: float = 30.0) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ---- pretty status ---------------------------------------------------------


def banner(msg: str) -> None:
    print(f"\n========== {msg} ==========")


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def fail(msg: str) -> None:
    print(f"  ✗ {msg}", file=sys.stderr)


# ---- Browser persona -------------------------------------------------------


def workflow_browser() -> bool:
    """A first-time visitor opens the dashboard and pokes around.

    The Next.js dashboard fetches /api/network + /api/cache-status on boot
    and /api/setup/status + /api/agents on tab switches. We hit the same
    endpoints in the same order and confirm each returns sensible data.
    """
    banner("Persona #1 — Browser (read-only dashboard tour)")
    try:
        net = jget(f"{API}/api/network")
        ok(f"GET /api/network → chain {net['chain_id']} head {net['head_block']}")
        cache = jget(f"{API}/api/cache-status")
        ok(f"GET /api/cache-status → {cache['agents_in_cache']} agents in cache")
        setup = jget(f"{API}/api/setup/status")
        ok(
            f"GET /api/setup/status → ready: core={setup['ready']['core']}, "
            f"keeperhub={setup['ready']['keeperhub_live']}, stub={setup['ready']['stub_demo']}"
        )
        agents = jget(f"{API}/api/agents?limit=5&ens=0")
        ok(f"GET /api/agents?limit=5 → {len(agents['agents'])} hydrated rows")
        if agents["agents"]:
            sample_id = agents["agents"][0]["agent_id"]
            detail = jget(f"{API}/api/agents/{sample_id}?ens=0")
            ok(f"GET /api/agents/{sample_id} → owner {detail['owner'][:10]}…")
        caps = jget(f"{API}/api/capabilities")
        ok(f"GET /api/capabilities → {caps['total']} unique capabilities (autocomplete fuel)")
        return True
    except Exception as e:
        fail(f"browser workflow: {type(e).__name__}: {e}")
        return False


# ---- Hirer persona ---------------------------------------------------------


def workflow_hirer() -> bool:
    """An external agent wants to outsource a job.

    Hirers don't run any workers locally; they POST to /api/find-best-agent
    to discover candidates, then POST to /api/hire to deliver. We exercise
    the discovery half (against the real Sepolia registry) and confirm the
    `Why this candidate?` rationale string is populated.
    """
    banner("Persona #2 — Hirer (REST API consumer)")
    try:
        # Discovery — try a popular capability the cache should have results for.
        for capability in ["defi", "swap", "translation", "messaging"]:
            res = jget(
                f"{API}/api/find-best-agent",
                body={"capability": capability, "budget": 1.0, "limit": 5},
            )
            if res["candidates"]:
                ok(
                    f"POST /api/find-best-agent {capability!r} → "
                    f"{len(res['candidates'])} candidate(s) ranked in {res['elapsed_seconds']:.2f}s"
                )
                ok(f"  rationale: {res['explanation']}")
                return True
            else:
                print(f"  · {capability}: 0 candidates (trying next)")
        fail("no capability returned candidates — registry cache is empty?")
        return False
    except Exception as e:
        fail(f"hirer workflow: {type(e).__name__}: {e}")
        return False


# ---- Worker persona --------------------------------------------------------


def workflow_worker() -> bool:
    """A developer runs the worker SDK and gets a job delivered.

    Driven against an SDK worker we spawn ourselves on port 9034 (peered
    via n3's a2a_addr — but here we route through a hire-and-deliver call
    using extra_candidates so we don't need a brand-new AXL node).

    Specifically: import worker_sdk, build the Flask app, run it on a
    dedicated port, hit /.well-known/agent-card.json directly, then send
    a SendMessage envelope by POSTing to / and confirm the artifact text.

    This isn't the full A2A loop (that would require a fresh AXL node),
    but it covers the SDK surface a worker developer actually writes.
    """
    banner("Persona #3 — Worker (SDK integration)")

    import threading
    from worker_sdk import make_app
    from example_worker import summarise

    sdk_port = 9099  # arbitrary unused port
    app = make_app(summarise, name="phase10-tester", capabilities=["summarise_documents"])

    server = None
    try:
        # Run the Flask app on a thread (Werkzeug dev server is fine for the test)
        from werkzeug.serving import make_server
        server = make_server(WORKER_SDK_HOST, sdk_port, app, threaded=True)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        time.sleep(0.3)

        # 1. Agent card
        card = jget(f"http://{WORKER_SDK_HOST}:{sdk_port}/.well-known/agent-card.json")
        if "summarise_documents" not in {s["id"] for s in card.get("skills", [])}:
            fail(f"worker agent-card.json missing summarise_documents skill: {card}")
            return False
        ok(f"GET .well-known/agent-card.json → skills={[s['id'] for s in card['skills']]}")

        # 2. SendMessage round-trip (the same wire format the AXL mesh forwards)
        envelope = {
            "jsonrpc": "2.0",
            "id": "phase10-1",
            "method": "SendMessage",
            "params": {
                "message": {
                    "parts": [
                        {
                            "kind": "text",
                            "text": json.dumps({
                                "service": "summarise_documents",
                                "request": {
                                    "method": "summarise",
                                    "params": {"input": "x" * 117},
                                },
                            }),
                        }
                    ]
                }
            },
        }
        reply = jget(f"http://{WORKER_SDK_HOST}:{sdk_port}/", body=envelope, timeout=5.0)
        artifact = reply["result"]["artifacts"][0]["parts"][0]["text"]
        decoded = json.loads(artifact)
        if decoded.get("worker") != "phase10-tester":
            fail(f"unexpected worker in artifact: {decoded}")
            return False
        if "117-char" not in decoded.get("result", ""):
            fail(f"summariser didn't produce expected stat: {decoded}")
            return False
        ok(f"POST / SendMessage → artifact: {decoded['result']!r}")

        # 3. Dry-run register so we exercise the on-chain path without spending gas.
        from worker_sdk import register_worker
        res = register_worker(
            capability="summarise_documents",
            name="phase10-tester",
            description="phase 10 workflow test worker",
            axl_pubkey="abcd" * 16,  # synthetic — we're not actually peering
            api_url=None,
            dry_run=True,
        )
        if res.get("mode") != "dry_run":
            fail(f"expected dry_run mode, got {res}")
            return False
        if not res.get("calldata", "").startswith("0xf2c298be"):
            fail(f"calldata selector wrong: {res.get('calldata', '')[:12]}")
            return False
        ok(f"register_worker(dry_run) → calldata starts {res['calldata'][:18]}… (selector matches register(string))")
        return True
    except Exception as e:
        fail(f"worker workflow: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        if server is not None:
            server.shutdown()


# ---- Operator persona ------------------------------------------------------


def workflow_operator() -> bool:
    """A team running TrustGate verifies their full pipeline still works.

    Reuses the Phase 8 smoke (complete-hire against local workers).
    """
    banner("Persona #4 — Operator (full hire-loop pipeline)")
    try:
        # Get worker pubkeys
        b = jget(f"{API}/api/axl/topology?api_port=9012")
        c = jget(f"{API}/api/axl/topology?api_port=9022")
        if not (b.get("topology") and c.get("topology")):
            fail("workers offline — run `bash scripts/run.sh` first")
            return False
        bpk = b["topology"]["our_public_key"]
        cpk = c["topology"]["our_public_key"]
        ok(f"discovered worker pubkeys: {bpk[:12]}…, {cpk[:12]}…")

        body = {
            "capability": "phase10-operator",
            "service": "uppercase_text",
            "input": "trustgate phase 10 operator workflow",
            "candidates": [],
            "extra_candidates": [
                {"agent_id": -1, "name": "worker-b", "axl_pubkey": bpk,
                 "endpoints": [{"name": "axl", "endpoint": bpk}]},
                {"agent_id": -1, "name": "worker-c", "axl_pubkey": cpk,
                 "endpoints": [{"name": "axl", "endpoint": cpk}]},
            ],
            "a2a_timeout": 5,
            "payment_amount_usdc": 0.1,
            "feedback_score": 0.95,
            "write_feedback_onchain": False,
            "force_stub_settlement": True,
        }
        out = jget(f"{API}/api/complete-hire", body=body, timeout=60.0)
        if out.get("overall_status") != "ok":
            fail(f"complete-hire failed: overall_status={out.get('overall_status')}, error={out.get('error')}")
            return False
        winner = out["hire"]["winner_index"]
        reply = out["hire"]["final_reply"]
        wf = (out.get("settlement") or {}).get("workflow_id")
        ok(f"POST /api/complete-hire → ok | winner=worker-{'b' if winner == 0 else 'c'} | reply={reply}")
        ok(f"  settlement workflow {wf}")
        return True
    except Exception as e:
        fail(f"operator workflow: {type(e).__name__}: {e}")
        return False


# ---- main ------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    global API
    p = argparse.ArgumentParser()
    p.add_argument("--api", default=API)
    p.add_argument("--skip", action="append", choices=["browser", "hirer", "worker", "operator"], default=[])
    args = p.parse_args(argv)
    API = args.api.rstrip("/")

    workflows = [
        ("browser", workflow_browser),
        ("hirer", workflow_hirer),
        ("worker", workflow_worker),
        ("operator", workflow_operator),
    ]
    results: dict[str, bool] = {}
    for name, fn in workflows:
        if name in args.skip:
            print(f"\n[skip] {name}")
            continue
        results[name] = fn()

    banner("Summary")
    for name, ok_ in results.items():
        print(f"  {'✓' if ok_ else '✗'}  {name}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
