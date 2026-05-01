"""Phase 4 A2A worker.

Replaces the raw `/recv`-polling Phase 1 mock with an actual A2A endpoint that
the AXL Go node forwards to. Architecture:

  Sender's AXL node ── /a2a/{peerId} ──> mesh ──> Receiver's AXL node
                                                   │
                                            forwards to a2a_addr:a2a_port
                                                   │
                                                   ▼
                                          this Flask app
                                                   │
                                  GET /.well-known/agent-card.json   →  agent card
                                  POST /                              →  SendMessage

The AXL Go node only shuttles raw JSON-RPC bytes — it does not parse them — so
we can implement a hackathon-grade A2A server in ~80 lines without pulling in
the full a2a-sdk.

Supported services (chosen via the `service` field of the inner MCP request):

    uppercase_text           — {"input": "..."} → {"result": "<UPPERCASED>"}
    summarise_documents      — {"input": "..."} → {"result": "summary of N-byte input"}
    sleep_then_succeed       — {"input": "...", "seconds": N} → after N seconds
    drop                     — never replies (used to test the fallback path)

Usage:
    python phase4_worker.py --port 9014 --name worker-b
    python phase4_worker.py --port 9024 --name worker-c --drop-first 1
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from typing import Any
from uuid import uuid4

from flask import Flask, jsonify, request


def make_app(name: str, drop_first: int = 0) -> Flask:
    app = Flask(__name__)
    log = logging.getLogger(f"worker:{name}")
    log.setLevel(logging.INFO)
    state = {"dropped": 0}

    def _execute(service: str, req: dict[str, Any]) -> dict[str, Any]:
        params = req.get("params", {}) if isinstance(req.get("params"), dict) else {}
        if service == "uppercase_text":
            return {"result": str(params.get("input", "")).upper(), "worker": name}
        if service == "summarise_documents":
            n = len(str(params.get("input", "")))
            return {"result": f"summary of {n}-byte input", "worker": name}
        if service == "sleep_then_succeed":
            secs = float(params.get("seconds", 1))
            time.sleep(secs)
            return {"result": f"woke after {secs:.1f}s", "worker": name}
        if service == "drop":
            time.sleep(60)  # block until the caller times out
            return {"result": "should never reach here", "worker": name}
        return {"error": f"unknown service: {service}", "worker": name}

    @app.get("/.well-known/agent-card.json")
    def agent_card():
        # Returned by the AXL node when a remote peer GETs /a2a/{ourPeerId}.
        return jsonify({
            "name": name,
            "description": f"TrustGate Phase 4 mock worker — {name}",
            "version": "1.0",
            "skills": [
                {"id": "uppercase_text", "name": "Uppercase text", "tags": ["text"]},
                {"id": "summarise_documents", "name": "Summarise input", "tags": ["text"]},
                {"id": "sleep_then_succeed", "name": "Delay then succeed", "tags": ["test"]},
                {"id": "drop", "name": "Never reply (fallback test)", "tags": ["test"]},
            ],
            "capabilities": {"streaming": False},
        })

    @app.post("/")
    def send_message():
        envelope = request.get_json(force=True, silent=True) or {}
        rpc_id = envelope.get("id")
        from_peer = request.headers.get("X-From-Peer-Id", "")
        method = envelope.get("method")
        params = envelope.get("params", {}) or {}
        message = params.get("message") if isinstance(params, dict) else None
        if method != "SendMessage" or not isinstance(message, dict):
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32601, "message": f"Unsupported method: {method!r}"},
            }), 200

        # Optional: drop the first N requests to demonstrate fallback.
        if state["dropped"] < drop_first:
            state["dropped"] += 1
            log.info(f"DROP {state['dropped']}/{drop_first}: silently sleeping")
            time.sleep(120)
            return ("", 504)

        # Inner MCP-shaped payload lives in parts[0].text, JSON-stringified.
        parts = message.get("parts") or []
        text = parts[0].get("text") if parts and isinstance(parts[0], dict) else ""
        try:
            mcp = json.loads(text) if text else {}
        except Exception as e:
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32700, "message": f"parts[0].text is not JSON: {e}"},
            }), 200

        service = mcp.get("service", "")
        inner_req = mcp.get("request") or {}
        log.info(f"recv from {from_peer[:16]}...  service={service!r}  inner_method={inner_req.get('method')!r}")

        result = _execute(service, inner_req)

        artifact_text = json.dumps(result)
        task_id = str(uuid4())
        return jsonify({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "kind": "task",
                "id": task_id,
                "context_id": str(uuid4()),
                "status": {"state": "TASK_STATE_COMPLETED"},
                "artifacts": [{
                    "artifact_id": str(uuid4()),
                    "name": f"{service}-result",
                    "parts": [{"kind": "text", "text": artifact_text}],
                }],
            },
        })

    return app


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=9014, help="A2A listen port (matches node-config.json a2a_port)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--name", default=os.getenv("WORKER_NAME", "worker"))
    p.add_argument("--drop-first", type=int, default=0,
                   help="silently sleep on the first N requests (to test orchestrator fallback)")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    print(f"[{args.name}] A2A listener on http://{args.host}:{args.port}  drop_first={args.drop_first}", flush=True)
    app = make_app(args.name, drop_first=args.drop_first)
    # disable Werkzeug's chatty access log
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    app.run(host=args.host, port=args.port, threaded=True, debug=False)
