"""Phase 1 end-to-end smoke test.

Assumes two AXL nodes are running locally:

  n1 (this side, "Agent A")  -> api_port 9002, peers []
  n2 ("Agent B")             -> api_port 9012, peers ["tls://127.0.0.1:9001"]

Agent B (agent_b_mock.py) must already be polling the n2 bridge.

This script:
  1. reads our pubkey from n1, B's pubkey from n2 (both via /topology)
  2. sends a JSON job spec from A -> B over the AXL mesh
  3. blocks on n1's /recv until B replies
  4. asserts the reply matches the expected result
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid

from axl_gateway import our_pubkey, recv_blocking, send_job, topology


EXPECTED_TASKS = {
    "uppercase_text": lambda spec: spec["input"].upper(),
    "summarise_documents": lambda spec: f"summary of {len(spec['input'])}-byte input",
}


def run(a_port: int, b_port: int, timeout: float) -> int:
    a_pk = our_pubkey(a_port)
    b_pk = our_pubkey(b_port)
    print(f"[A] our pubkey: {a_pk}")
    print(f"[B] their pubkey: {b_pk}")

    a_peers = topology(a_port).get("peers", [])
    b_peers = topology(b_port).get("peers", [])
    print(f"[A] sees {len(a_peers)} peer(s); [B] sees {len(b_peers)} peer(s)")
    if not a_peers or not b_peers:
        print("ERROR: nodes are not peered yet — start both nodes and wait for handshake")
        return 2

    job_id = str(uuid.uuid4())
    job_spec = {
        "job_id": job_id,
        "task": "uppercase_text",
        "input": "trustgate phase 1 ok",
        "budget": 0.10,
        "capabilities": ["uppercase_text"],
        "deadline": 30,
    }
    print(f"[A] sending job {job_id}: {job_spec}")
    sent = send_job(b_pk, job_spec, api_port=a_port)
    print(f"[A] /send accepted ({sent} bytes)")

    print(f"[A] waiting up to {timeout}s for reply on /recv ...")
    sender, body = recv_blocking(a_port, timeout=timeout)
    reply = json.loads(body.decode("utf-8"))
    print(f"[A] reply from {sender[:16]}: {reply}")

    expected = EXPECTED_TASKS[job_spec["task"]](job_spec)
    ok = (
        reply.get("status") == "ok"
        and reply.get("result") == expected
        and reply.get("job_id") == job_id
    )
    if ok:
        print("PASS — Phase 1 end-to-end loop works")
        return 0
    print(f"FAIL — expected result={expected!r}, got {reply!r}")
    return 1


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--a-port", type=int, default=9002)
    p.add_argument("--b-port", type=int, default=9012)
    p.add_argument("--timeout", type=float, default=30.0)
    args = p.parse_args()
    sys.exit(run(args.a_port, args.b_port, args.timeout))
