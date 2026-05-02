"""TrustGate worker SDK — Phase 10.

The supply-side enabler: lets any developer turn a single Python function into
a discoverable, hireable ERC-8004 agent in a few lines of code. Wraps the
Phase 4 A2A listener pattern and the Phase 6 register helpers so workers
don't have to learn AXL / ERC-8004 internals.

Two public surfaces:

    register_worker(capability, *, name, description, axl_pubkey=None,
                    api_url=None, dry_run=False, **kwargs) -> dict
        Registers the worker on Identity Registry. Returns the live tx hash
        + new agent_id, or dry-run calldata if PRIVATE_KEY is not set / the
        caller forces dry_run=True.

    run(handler, *, port, name, axl_api_port=9012, **kwargs)
        Starts the A2A listener (Flask) and dispatches each SendMessage
        envelope to the user's handler. The handler signature is:

            def handler(input: Any, *, service: str, **ctx) -> dict

        Whatever the handler returns is wrapped into the standard
        artifact envelope that the AXL mesh forwards back to the orchestrator.

CLI shortcuts (covered by `python -m worker_sdk`):

    python -m worker_sdk register --capability summarise_documents \\
        --description "fast OSS summariser"
    python -m worker_sdk run --handler example_worker:summarise --port 9014

The CLI is deliberately minimal — most production users will import the two
functions directly from their own entrypoint.
"""
from __future__ import annotations

import argparse
import importlib
import json
import logging
import os
import sys
import time
from typing import Any, Callable, Optional
from uuid import uuid4

import requests
from flask import Flask, jsonify, request

from axl_gateway import topology
from registry_client import RegistryClient
from self_registration import build_self_card, encode_self_card_uri


log = logging.getLogger("worker_sdk")


# ----- registration -----------------------------------------------------------


def register_worker(
    capability: str,
    *,
    name: str,
    description: Optional[str] = None,
    axl_pubkey: Optional[str] = None,
    axl_api_port: int = 9012,
    api_url: Optional[str] = None,
    extra_skills: Optional[list[str]] = None,
    dry_run: bool = False,
    private_key: Optional[str] = None,
    wait_for_receipt: bool = True,
    client: Optional[RegistryClient] = None,
) -> dict:
    """Register this worker on ERC-8004 IdentityRegistry.

    `capability` is the primary capability tag the worker advertises. Extra
    capabilities can be appended via `extra_skills`. If `axl_pubkey` is None
    we probe the local AXL bridge at `axl_api_port` to fetch it — meaning a
    worker started via `bash scripts/run.sh` doesn't have to know its own
    pubkey.

    Returns the same shape as `RegistryClient.send_register`:
      {"mode": "live", "agent_id": N, "tx_hash": "0x…", ...}
      {"mode": "dry_run", "calldata": "0x…", "to": "0x…", ...}
    """
    rc = client or RegistryClient()

    if axl_pubkey is None:
        try:
            t = topology(axl_api_port)
            axl_pubkey = t.get("our_public_key")
        except Exception as e:
            log.info("could not auto-detect AXL pubkey from :%d (%s)", axl_api_port, e)

    skills = [capability] + list(extra_skills or [])
    card = build_self_card(
        name=name,
        description=description or f"TrustGate worker ({capability})",
        ens_name=None,
        axl_pubkey=axl_pubkey,
        api_url=api_url,
        extra_skills=skills,
    )
    agent_uri = encode_self_card_uri(card)
    res = rc.send_register(
        agent_uri,
        private_key=private_key,
        dry_run=dry_run,
        wait_for_receipt=wait_for_receipt,
    )
    res["card"] = card
    res["axl_pubkey"] = axl_pubkey
    return res


# ----- run loop ---------------------------------------------------------------


WorkerHandler = Callable[..., dict]


def _resolve_handler(spec: str) -> WorkerHandler:
    """`module:fn` -> the live function. Raises a clear error if either piece is missing."""
    if ":" not in spec:
        raise ValueError(
            f"Handler spec {spec!r} must be in the form 'module:function' — "
            "e.g. example_worker:summarise"
        )
    module_name, fn_name = spec.split(":", 1)
    mod = importlib.import_module(module_name)
    if not hasattr(mod, fn_name):
        raise AttributeError(f"module {module_name!r} has no attribute {fn_name!r}")
    fn = getattr(mod, fn_name)
    if not callable(fn):
        raise TypeError(f"{spec!r} resolved to {type(fn).__name__}, not callable")
    return fn


def make_app(handler: WorkerHandler, *, name: str, capabilities: list[str]) -> Flask:
    """Build a Flask app that dispatches A2A SendMessage envelopes to `handler`.

    The wire format mirrors phase4_worker.py exactly (same agent-card schema,
    same task-result envelope) so existing orchestrators can hire SDK workers
    without changes.
    """
    app = Flask(__name__)
    app_log = logging.getLogger(f"worker:{name}")

    @app.get("/.well-known/agent-card.json")
    def agent_card():
        return jsonify({
            "name": name,
            "description": f"TrustGate worker ({name})",
            "version": "1.0",
            "skills": [{"id": s, "name": s, "tags": ["trustgate"]} for s in capabilities],
            "capabilities": {"streaming": False},
        })

    @app.post("/")
    def send_message():
        envelope = request.get_json(force=True, silent=True) or {}
        rpc_id = envelope.get("id")
        if envelope.get("method") != "SendMessage":
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32601, "message": f"Unsupported method: {envelope.get('method')!r}"},
            }), 200
        message = (envelope.get("params") or {}).get("message")
        if not isinstance(message, dict):
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32602, "message": "params.message missing or not an object"},
            }), 200

        parts = message.get("parts") or []
        text = parts[0].get("text") if parts and isinstance(parts[0], dict) else ""
        try:
            mcp = json.loads(text) if text else {}
        except Exception as e:
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32700, "message": f"parts[0].text is not JSON: {e}"},
            }), 200

        service = str(mcp.get("service") or "")
        inner = mcp.get("request") or {}
        params = inner.get("params") if isinstance(inner.get("params"), dict) else {}
        from_peer = request.headers.get("X-From-Peer-Id", "")
        app_log.info("recv from %s service=%r", from_peer[:16] + "…" if from_peer else "?", service)

        try:
            # Pass the inner params as the handler's primary input. We also
            # forward `service`, `from_peer`, and the raw `mcp` envelope so
            # power users can route on capability or peer.
            result = handler(params, service=service, from_peer=from_peer, mcp=mcp)
        except Exception as e:
            app_log.exception("handler raised")
            return jsonify({
                "jsonrpc": "2.0", "id": rpc_id,
                "error": {"code": -32000, "message": f"handler error: {type(e).__name__}: {e}"},
            }), 200

        if not isinstance(result, dict):
            result = {"result": result}
        result.setdefault("worker", name)

        return jsonify({
            "jsonrpc": "2.0", "id": rpc_id,
            "result": {
                "kind": "task",
                "id": str(uuid4()),
                "context_id": str(uuid4()),
                "status": {"state": "TASK_STATE_COMPLETED"},
                "artifacts": [{
                    "artifact_id": str(uuid4()),
                    "name": f"{service}-result",
                    "parts": [{"kind": "text", "text": json.dumps(result)}],
                }],
            },
        })

    return app


def run(
    handler: WorkerHandler,
    *,
    port: int,
    name: str,
    capabilities: Optional[list[str]] = None,
    host: str = "127.0.0.1",
) -> None:
    """Start the A2A listener loop. Blocks forever."""
    capabilities = capabilities or []
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    print(f"[{name}] A2A listener on http://{host}:{port}  capabilities={capabilities}", flush=True)
    app = make_app(handler, name=name, capabilities=capabilities)
    app.run(host=host, port=port, threaded=True, debug=False)


# ----- CLI ---------------------------------------------------------------------


def _cmd_register(args: argparse.Namespace) -> int:
    res = register_worker(
        capability=args.capability,
        name=args.name,
        description=args.description,
        axl_pubkey=args.axl_pubkey,
        axl_api_port=args.axl_api_port,
        api_url=args.api_url,
        extra_skills=args.extra_skills or None,
        dry_run=args.dry_run,
    )
    print(json.dumps(
        {k: v for k, v in res.items() if k != "tx"},  # tx dict is huge; trim
        indent=2,
        default=str,
    ))
    if res.get("mode") == "live" and res.get("agent_id") is not None:
        print(f"\n✓ registered as agent #{res['agent_id']}")
        if res.get("tx_hash"):
            print(f"  basescan: https://sepolia.basescan.org/tx/{res['tx_hash']}")
    elif res.get("mode") == "dry_run":
        print("\nℹ dry-run only. Set PRIVATE_KEY in .env to broadcast.")
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    handler = _resolve_handler(args.handler)
    run(
        handler,
        port=args.port,
        name=args.name,
        capabilities=args.capabilities or [],
        host=args.host,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="worker_sdk")
    sub = p.add_subparsers(dest="cmd", required=True)

    pr = sub.add_parser("register", help="register this worker on IdentityRegistry")
    pr.add_argument("--capability", required=True, help="primary capability tag")
    pr.add_argument("--name", required=True)
    pr.add_argument("--description", default=None)
    pr.add_argument("--axl-pubkey", default=None, help="auto-detected from AXL topology when omitted")
    pr.add_argument("--axl-api-port", type=int, default=9012)
    pr.add_argument("--api-url", default=None)
    pr.add_argument("--extra-skills", action="append", default=None,
                    help="additional capability tags (repeatable)")
    pr.add_argument("--dry-run", action="store_true",
                    help="preview calldata even when PRIVATE_KEY is set")

    pc = sub.add_parser("run", help="start the A2A listener")
    pc.add_argument("--handler", required=True, help="module:function — e.g. example_worker:summarise")
    pc.add_argument("--port", type=int, required=True, help="A2A listen port (matches node-config.json a2a_port)")
    pc.add_argument("--name", required=True)
    pc.add_argument("--host", default="127.0.0.1")
    pc.add_argument("--capabilities", action="append", default=None,
                    help="capability tags advertised in the agent-card.json (repeatable)")

    args = p.parse_args(argv)
    if args.cmd == "register":
        return _cmd_register(args)
    if args.cmd == "run":
        return _cmd_run(args)
    p.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
