"""TrustGate HTTP API.

Exposes the Phase 1–3 functionality to the Next.js dashboard:

  GET  /api/health
  GET  /api/network                       — current chain + registry addresses
  GET  /api/agents?capability=&limit=&active=&offset=
  GET  /api/agents/:id                    — full hydrated card + reputation
  GET  /api/agents/:id/reputation
  GET  /api/agents/:id/feedback?limit=
  GET  /api/cache-status                  — what's in the on-disk cache
  POST /api/find-best-agent               — body: {capability, budget, min_reputation}
  GET  /api/axl/topology?api_port=        — proxy to a local AXL bridge
  POST /api/axl/send-job                  — body: {a_port, b_port, task, input, timeout}

The server intentionally never *writes* to the chain — Phase 5 will add a
separate signing path. This keeps the dashboard read-only-safe.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

import requests as http_requests

# ensure relative imports work whether invoked from repo root or app/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from axl_gateway import recv_blocking, send_job, topology  # noqa: E402
from config import AXL_NODE_PORT, BASE_RPC_URL, IDENTITY_REGISTRY_ADDRESS, NETWORK, REPUTATION_REGISTRY_ADDRESS  # noqa: E402
from hiring import find_best_agent, select_top  # noqa: E402
from registry_client import RegistryClient, resolve_agent_card  # noqa: E402

app = Flask(__name__)
CORS(app)


@app.errorhandler(Exception)
def _on_exception(e: Exception):
    """Always return JSON, never an HTML 500 page (the dashboard expects JSON)."""
    import traceback
    tb = traceback.format_exc()
    print(f"[server] {type(e).__name__}: {e}\n{tb}", flush=True)
    code = getattr(e, "code", 500) or 500
    return jsonify({
        "error": f"{type(e).__name__}: {str(e)[:500]}",
        "path": request.path if request else None,
    }), code if isinstance(code, int) else 500

_client_lock = threading.Lock()
_client: RegistryClient | None = None


def client() -> RegistryClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = RegistryClient()
        return _client


def _agent_to_dict(a) -> dict[str, Any]:
    return {
        "agent_id": a.agent_id,
        "name": a.name,
        "owner": a.owner,
        "agent_uri": a.agent_uri,
        "block": a.block,
        "tx_hash": a.tx_hash,
        "active": a.active,
        "capabilities": a.capabilities,
        "endpoints": a.endpoints,
        "card": a.card,
        "card_load_error": a.card_load_error,
    }


# ---- core ------------------------------------------------------------------


@app.get("/api/health")
def health():
    rc = client()
    return jsonify({
        "ok": True,
        "rpc": rc.rpc_url,
        "chain_id": rc.chain_id,
        "head_block": rc.w3.eth.block_number,
    })


@app.get("/api/network")
def network():
    rc = client()
    return jsonify({
        "network": NETWORK,
        "rpc_url": BASE_RPC_URL,
        "chain_id": rc.chain_id,
        "head_block": rc.w3.eth.block_number,
        "identity_registry": IDENTITY_REGISTRY_ADDRESS,
        "reputation_registry": REPUTATION_REGISTRY_ADDRESS,
    })


@app.get("/api/cache-status")
def cache_status():
    rc = client()
    cache = rc._load_cache()
    head = rc.w3.eth.block_number
    last = cache.get("last_scanned_block")
    return jsonify({
        "deploy_block": cache.get("deploy_block"),
        "last_scanned_block": last,
        "head_block": head,
        "blocks_behind": (head - last) if last else None,
        "agents_in_cache": len(cache.get("agents", {})),
        "cards_in_cache": len(rc._card_cache),
        "cache_path": rc.cache_path,
    })


# ---- agents ----------------------------------------------------------------


@app.get("/api/agents")
def list_agents():
    rc = client()
    capability = request.args.get("capability") or None
    limit = int(request.args.get("limit", "50"))
    offset = int(request.args.get("offset", "0"))
    only_active = request.args.get("active", "1") not in {"0", "false", "False"}
    require_card = request.args.get("require_card", "1") not in {"0", "false", "False"}
    agents = rc.query_agents(
        capability=capability,
        limit=offset + limit,
        only_active=only_active,
        require_card=require_card,
        card_timeout=2.0,
    )
    sliced = agents[offset:offset + limit]
    return jsonify({
        "total_returned": len(agents),
        "offset": offset,
        "limit": limit,
        "agents": [_agent_to_dict(a) for a in sliced],
    })


@app.get("/api/agents/<int:agent_id>")
def get_agent(agent_id: int):
    rc = client()
    cache = rc._load_cache()
    row = cache.get("agents", {}).get(str(agent_id))
    if row is None:
        return jsonify({"error": "agent not in cache; --refresh may help"}), 404
    live_uri = None
    try:
        live_uri = rc.get_token_uri(agent_id)
    except Exception:
        pass
    card = None
    err = None
    try:
        card = rc._resolve_card_cached(agent_id, row["agent_uri"], timeout=3.0)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
    rep = rc.get_reputation(agent_id)
    rc._save_card_cache()
    return jsonify({
        "agent_id": agent_id,
        "owner": row["owner"],
        "agent_uri": row["agent_uri"],
        "live_token_uri": live_uri,
        "block": row["block"],
        "tx_hash": row["tx_hash"],
        "card": card,
        "card_error": err,
        "reputation": rep,
    })


@app.get("/api/agents/<int:agent_id>/reputation")
def get_reputation(agent_id: int):
    rc = client()
    return jsonify(rc.get_reputation(agent_id))


@app.get("/api/agents/<int:agent_id>/feedback")
def get_feedback(agent_id: int):
    rc = client()
    limit = int(request.args.get("limit", "20"))
    return jsonify({
        "agent_id": agent_id,
        "rows": rc.get_recent_feedback(agent_id, limit=limit),
    })


# ---- ranking ---------------------------------------------------------------


@app.post("/api/find-best-agent")
def post_find_best_agent():
    body = request.get_json(force=True, silent=True) or {}
    capability = body.get("capability")
    if not capability:
        return jsonify({"error": "capability is required"}), 400
    budget = float(body.get("budget", 1.0))
    min_rep = float(body.get("min_reputation", 0.0))
    require_fb = bool(body.get("require_feedback", False))
    limit = int(body.get("limit", 25))
    default_price = float(body.get("default_price", 0.0))
    default_latency = float(body.get("default_latency", 30.0))
    t0 = time.time()
    ranked = find_best_agent(
        capability=capability,
        budget=budget,
        min_reputation=min_rep,
        require_feedback=require_fb,
        limit_candidates=limit,
        default_price=default_price,
        default_latency=default_latency,
    )
    winner, runner_up, why = select_top(ranked)
    return jsonify({
        "capability": capability,
        "budget": budget,
        "min_reputation": min_rep,
        "elapsed_seconds": time.time() - t0,
        "explanation": why,
        "candidates": [c.to_dict() for c in ranked],
    })


# ---- AXL bridge passthroughs ----------------------------------------------


@app.get("/api/axl/topology")
def axl_topology():
    api_port = int(request.args.get("api_port", AXL_NODE_PORT))
    try:
        return jsonify({"api_port": api_port, "topology": topology(api_port)})
    except http_requests.exceptions.RequestException as e:
        return jsonify({"api_port": api_port, "error": f"{type(e).__name__}: {e}"}), 502


@app.post("/api/axl/send-job")
def axl_send_job():
    body = request.get_json(force=True, silent=True) or {}
    a_port = int(body.get("a_port", 9002))
    b_port = int(body.get("b_port", 9012))
    task = body.get("task", "uppercase_text")
    payload = body.get("input", "trustgate axl ok")
    timeout = float(body.get("timeout", 30.0))
    try:
        a_top = topology(a_port)
        b_top = topology(b_port)
    except Exception as e:
        return jsonify({"error": f"AXL bridge unreachable: {e}"}), 502
    job_id = str(uuid.uuid4())
    job_spec = {
        "job_id": job_id,
        "task": task,
        "input": payload,
        "budget": 0.10,
        "deadline": int(timeout),
    }
    sent = send_job(b_top["our_public_key"], job_spec, api_port=a_port)
    try:
        sender, body_bytes = recv_blocking(a_port, timeout=timeout)
        reply = json.loads(body_bytes.decode("utf-8"))
    except TimeoutError as e:
        return jsonify({
            "ok": False, "job_id": job_id, "sent_bytes": sent,
            "error": str(e),
            "a_pubkey": a_top["our_public_key"], "b_pubkey": b_top["our_public_key"],
        }), 504
    return jsonify({
        "ok": True,
        "job_id": job_id,
        "sent_bytes": sent,
        "job_spec": job_spec,
        "reply_from": sender,
        "reply": reply,
        "a_pubkey": a_top["our_public_key"],
        "b_pubkey": b_top["our_public_key"],
    })


# ----------------------------------------------------------------------------


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    print(f"[trustgate-api] http://127.0.0.1:{port}  network={NETWORK}")
    app.run(host="127.0.0.1", port=port, threaded=True, debug=False)
