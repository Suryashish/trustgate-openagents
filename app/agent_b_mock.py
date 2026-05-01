"""Minimal Agent B simulator.

Listens on an AXL node's local HTTP bridge for inbound job specs (sent over the
P2P mesh by Agent A / TrustGate), executes a trivial mock function, and replies
to the sender over the same mesh.

The mock 'capability' is uppercase_text — given {"task": "uppercase_text",
"input": "..."}, it returns {"status": "ok", "result": "<UPPERCASED>"}.
"""
from __future__ import annotations

import argparse
import json
import time

from axl_gateway import our_pubkey, recv_blocking, send_bytes


def execute(task_spec: dict) -> dict:
    task = task_spec.get("task")
    if task == "uppercase_text":
        return {"status": "ok", "result": task_spec.get("input", "").upper()}
    if task == "summarise_documents":
        n = len(task_spec.get("input", ""))
        return {"status": "ok", "result": f"summary of {n}-byte input"}
    return {"status": "error", "error": f"unknown task: {task}"}


def serve(api_port: int, idle_timeout: float | None = None) -> None:
    pk = our_pubkey(api_port)
    print(f"[agent_b] listening on AXL bridge :{api_port} as pubkey {pk[:16]}...", flush=True)
    started = time.monotonic()
    while True:
        try:
            sender, body = recv_blocking(api_port, timeout=2.0)
        except TimeoutError:
            if idle_timeout is not None and time.monotonic() - started > idle_timeout:
                print(f"[agent_b] idle timeout after {idle_timeout}s, shutting down", flush=True)
                return
            continue
        except Exception as e:
            # Transient HTTP/RPC errors talking to the local AXL bridge — keep going.
            print(f"[agent_b] recv error: {type(e).__name__}: {e}; sleeping 1s", flush=True)
            time.sleep(1.0)
            continue
        try:
            spec = json.loads(body.decode("utf-8"))
        except Exception as e:
            print(f"[agent_b] dropped non-JSON message from {sender[:16]}: {e}", flush=True)
            continue
        print(f"[agent_b] job from {sender[:16]}: {spec}", flush=True)
        result = execute(spec)
        result["job_id"] = spec.get("job_id")
        try:
            send_bytes(sender, json.dumps(result).encode("utf-8"), api_port)
        except Exception as e:
            print(f"[agent_b] send error: {type(e).__name__}: {e}", flush=True)
            continue
        print(f"[agent_b] replied: {result}", flush=True)
        started = time.monotonic()  # reset idle timer on activity


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=9012, help="AXL bridge api_port for this node")
    p.add_argument("--idle-timeout", type=float, default=None, help="exit after N idle seconds")
    args = p.parse_args()
    serve(args.port, idle_timeout=args.idle_timeout)
