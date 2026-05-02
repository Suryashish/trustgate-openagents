"""Phase 8 smoke test — exercises the same /api/complete-hire path the
new Overview "Run a sample hire" button uses.

Prereq: scripts/run.sh has finished its readiness gate (banner printed).
Reads the two worker AXL pubkeys via /api/axl/topology, then POSTs to
/api/complete-hire with synthetic candidates pointing at them.

Exits 0 on a clean overall_status="ok"; non-zero otherwise so this can
be wired into CI later.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def jget(url: str, *, body: dict | None = None, timeout: float = 30.0) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--b-port", type=int, default=9012)
    ap.add_argument("--c-port", type=int, default=9022)
    args = ap.parse_args()

    api = args.api.rstrip("/")
    print(f"[probe] {api}/api/axl/topology?api_port={args.b_port}")
    b = jget(f"{api}/api/axl/topology?api_port={args.b_port}")
    print(f"[probe] {api}/api/axl/topology?api_port={args.c_port}")
    c = jget(f"{api}/api/axl/topology?api_port={args.c_port}")
    if not (b.get("topology") and c.get("topology")):
        print("ERROR: workers' AXL nodes not reachable", file=sys.stderr)
        print(json.dumps({"b": b, "c": c}, indent=2), file=sys.stderr)
        return 2
    bpk = b["topology"]["our_public_key"]
    cpk = c["topology"]["our_public_key"]
    print(f"[probe] worker-b pubkey {bpk[:24]}…")
    print(f"[probe] worker-c pubkey {cpk[:24]}…")

    body = {
        "capability": "phase8-smoke",
        "service": "uppercase_text",
        "input": "trustgate phase 8 smoke test",
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
    print(f"[run] POST {api}/api/complete-hire")
    try:
        out = jget(f"{api}/api/complete-hire", body=body, timeout=60.0)
    except urllib.error.HTTPError as e:
        print(f"ERROR: {e.code} {e.reason}: {e.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
        return 3

    print(f"  overall_status: {out.get('overall_status')}")
    hire = out.get("hire") or {}
    print(f"  winner_index:   {hire.get('winner_index')}")
    print(f"  final_reply:    {hire.get('final_reply')}")
    settle = out.get("settlement") or {}
    print(f"  settlement:     mode={settle.get('mode')} status={settle.get('status')} "
          f"workflow={settle.get('workflow_id') or '—'}")
    fb = out.get("feedback") or {}
    print(f"  feedback:       mode={fb.get('mode')} reason={fb.get('reason') or '—'}")
    return 0 if out.get("overall_status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
