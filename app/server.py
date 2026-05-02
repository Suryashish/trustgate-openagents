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

from axl_gateway import A2AError, fetch_agent_card, recv_blocking, send_a2a_task, send_job, topology  # noqa: E402
from config import AXL_NODE_PORT, BASE_RPC_URL, IDENTITY_REGISTRY_ADDRESS, NETWORK, REPUTATION_REGISTRY_ADDRESS  # noqa: E402
from hiring import complete_hire_loop, find_best_agent, hire_and_deliver, select_top  # noqa: E402
from keeper_client import (  # noqa: E402
    KEEPERHUB_NETWORK, KEEPERHUB_PAYER_TOKEN,
    settle_payment as keeper_settle_payment,
    write_feedback as keeper_write_feedback,
)
from registry_client import RegistryClient, resolve_agent_card  # noqa: E402
from ens_client import default_resolver as default_ens_resolver  # noqa: E402
from self_registration import build_self_card, encode_self_card_uri  # noqa: E402

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


@app.get("/api/axl/agent-card")
def axl_agent_card():
    api_port = int(request.args.get("api_port", AXL_NODE_PORT))
    peer = request.args.get("peer", "")
    if not peer:
        return jsonify({"error": "missing 'peer'"}), 400
    try:
        return jsonify({"api_port": api_port, "peer": peer, "card": fetch_agent_card(peer, api_port=api_port)})
    except http_requests.exceptions.RequestException as e:
        return jsonify({"error": f"{type(e).__name__}: {e}"}), 502


@app.post("/api/axl/a2a")
def axl_a2a():
    """Phase 4: send a single A2A SendMessage envelope. Useful for poking workers."""
    body = request.get_json(force=True, silent=True) or {}
    peer = body.get("peer", "")
    service = body.get("service", "uppercase_text")
    inner = body.get("inner_request") or {"params": {"input": body.get("input", "trustgate phase 4")}}
    api_port = int(body.get("api_port", AXL_NODE_PORT))
    timeout = float(body.get("timeout", 10.0))
    if not peer:
        return jsonify({"error": "missing 'peer'"}), 400
    try:
        reply = send_a2a_task(peer, service, inner, api_port=api_port, timeout=timeout)
    except A2AError as e:
        return jsonify({"ok": False, "error": str(e)}), 502
    return jsonify({"ok": True, "peer": peer, "service": service, "reply": reply})


@app.post("/api/hire")
def post_hire():
    """Phase 4: discover + rank + deliver, with retry/fallback."""
    body = request.get_json(force=True, silent=True) or {}
    capability = body.get("capability") or ""
    service = body.get("service") or "uppercase_text"
    inner = body.get("inner_request")
    if inner is None:
        inner = {"params": {"input": body.get("input", "trustgate phase 4 hire")}}
    a2a_timeout = float(body.get("a2a_timeout", 10.0))
    max_attempts = int(body.get("max_attempts", 3))
    api_port = int(body.get("api_port", AXL_NODE_PORT))

    extra = body.get("extra_candidates") or []
    # `candidates` present (even empty list) means "skip discovery". Use
    # `is None` so an explicit empty list is honoured.
    candidates_in = body.get("candidates", None)

    discovered = None
    if candidates_in is None:
        if not capability:
            return jsonify({"error": "either capability or candidates is required"}), 400
        discovered = find_best_agent(
            capability=capability,
            budget=float(body.get("budget", 1.0)),
            min_reputation=float(body.get("min_reputation", 0.0)),
            require_feedback=bool(body.get("require_feedback", False)),
            limit_candidates=int(body.get("limit", 10)),
        )

    out = hire_and_deliver(
        capability=capability,
        service=service,
        inner_request=inner,
        candidates=discovered if candidates_in is None else candidates_in,
        extra_candidates=extra,
        a2a_timeout=a2a_timeout,
        max_attempts=max_attempts,
        api_port=api_port,
    )
    return jsonify(out.to_dict())


@app.get("/api/settlement/status")
def settlement_status():
    """Phase 5: report whether KeeperHub credentials + a signing key are configured."""
    has_pk = bool(os.getenv("PRIVATE_KEY", ""))
    has_keeper_key = bool(os.getenv("KEEPERHUB_API_KEY", ""))
    rc = client()
    chain_id = rc.chain_id
    out = {
        "keeperhub": {
            "api_key_configured": has_keeper_key,
            "mode": "live" if has_keeper_key else "stub",
            "network": KEEPERHUB_NETWORK,
            "token": KEEPERHUB_PAYER_TOKEN,
        },
        "feedback_signer": {
            "private_key_configured": has_pk,
            "mode": "live" if has_pk else "dry_run",
            "chain_id": chain_id,
        },
    }
    if has_pk:
        from eth_account import Account
        try:
            acct = Account.from_key(os.getenv("PRIVATE_KEY"))
            balance = rc.w3.eth.get_balance(acct.address)
            out["feedback_signer"]["address"] = acct.address
            out["feedback_signer"]["balance_wei"] = int(balance)
            out["feedback_signer"]["balance_eth"] = float(rc.w3.from_wei(balance, "ether"))
        except Exception as e:
            out["feedback_signer"]["error"] = f"{type(e).__name__}: {e}"
    return jsonify(out)


@app.post("/api/settle")
def post_settle():
    body = request.get_json(force=True, silent=True) or {}
    wallet = body.get("agent_wallet") or ""
    amount = float(body.get("amount_usdc", 0.1))
    force_stub = bool(body.get("force_stub", False))
    res = keeper_settle_payment(wallet, amount, force_stub=force_stub)
    return jsonify(res.to_dict())


@app.post("/api/write-feedback")
def post_write_feedback():
    body = request.get_json(force=True, silent=True) or {}
    agent_id = body.get("agent_id")
    if agent_id is None:
        return jsonify({"error": "agent_id is required"}), 400
    score = float(body.get("score", 0.95))
    tags = body.get("tags") or ["trustgate"]
    endpoint_str = body.get("endpoint", "") or ""
    feedback_uri = body.get("feedback_uri", "") or ""
    feedback_payload = body.get("feedback_payload")
    res = keeper_write_feedback(
        int(agent_id), score,
        tags=tags, endpoint=endpoint_str,
        feedback_uri=feedback_uri, feedback_payload=feedback_payload,
        client=client(),
    )
    return jsonify(res.to_dict())


@app.post("/api/complete-hire")
def post_complete_hire():
    """Phase 5 entry point — discover → deliver → settle → write feedback."""
    body = request.get_json(force=True, silent=True) or {}
    capability = body.get("capability") or ""
    service = body.get("service") or "uppercase_text"
    inner = body.get("inner_request")
    if inner is None:
        inner = {"params": {"input": body.get("input", "trustgate phase 5")}}

    extra = body.get("extra_candidates") or []
    candidates_in = body.get("candidates", None)
    discovered = None
    if candidates_in is None:
        if not capability:
            return jsonify({"error": "either capability or candidates is required"}), 400
        discovered = find_best_agent(
            capability=capability,
            budget=float(body.get("budget", 1.0)),
            min_reputation=float(body.get("min_reputation", 0.0)),
            require_feedback=bool(body.get("require_feedback", False)),
            limit_candidates=int(body.get("limit", 10)),
            client=client(),
        )

    out = complete_hire_loop(
        capability=capability, service=service, inner_request=inner,
        candidates=discovered if candidates_in is None else candidates_in,
        extra_candidates=extra,
        a2a_timeout=float(body.get("a2a_timeout", 10.0)),
        max_attempts=int(body.get("max_attempts", 3)),
        api_port=int(body.get("api_port", AXL_NODE_PORT)),
        payment_amount_usdc=float(body.get("payment_amount_usdc", 0.1)),
        feedback_score=float(body.get("feedback_score", 0.95)),
        feedback_tags=body.get("feedback_tags"),
        feedback_endpoint=body.get("feedback_endpoint"),
        write_feedback_onchain=bool(body.get("write_feedback_onchain", True)),
        force_stub_settlement=bool(body.get("force_stub_settlement", False)),
        client=client(),
    )
    return jsonify(out.to_dict())


# ---- Phase 6: ENS + self-registration ------------------------------------


@app.get("/api/ens/resolve")
def ens_resolve():
    """Best-effort reverse-resolve an address to its primary ENS name.

    Address can also be passed as ?name= for forward resolution. ENS lives on
    Ethereum mainnet, not Base, so this hits a different RPC (ENS_RPC_URL).
    """
    addr = request.args.get("address", "").strip()
    name = request.args.get("name", "").strip()
    resolver = default_ens_resolver()
    out: dict[str, Any] = {"rpc_url": resolver.rpc_url}
    if addr:
        ens_name = resolver.name_for(addr)
        out.update({"address": addr, "name": ens_name})
        if ens_name:
            out["forward_address"] = resolver.address_for(ens_name)
    elif name:
        out.update({"name": name, "address": resolver.address_for(name)})
    else:
        return jsonify({"error": "pass ?address= or ?name="}), 400
    return jsonify(out)


@app.get("/api/self/status")
def self_status():
    """Reports everything the dashboard needs before showing a 'register' button.

    - signing key state (from PRIVATE_KEY)
    - signer's ENS name (mainnet) — drives the ENS prize narrative
    - already-registered agent ids owned by the signer (from local cache)
    - the agent card we'd register (so the user can review before signing)
    """
    rc = client()
    pk = os.getenv("PRIVATE_KEY", "")
    signer: dict[str, Any] = {"private_key_configured": bool(pk)}
    address: str | None = None
    ens_name: str | None = None
    if pk:
        try:
            from eth_account import Account
            acct = Account.from_key(pk)
            address = acct.address
            balance = rc.w3.eth.get_balance(address)
            signer.update({
                "address": address,
                "balance_wei": int(balance),
                "balance_eth": float(rc.w3.from_wei(balance, "ether")),
            })
        except Exception as e:
            signer["error"] = f"{type(e).__name__}: {e}"
    if address:
        ens_name = default_ens_resolver().name_for(address)
        signer["ens_name"] = ens_name

    owned: list[int] = rc.find_owned_agent_ids(address) if address else []

    card = build_self_card(
        ens_name=ens_name,
        axl_pubkey=request.args.get("axl_pubkey") or None,
        api_url=os.getenv("TRUSTGATE_PUBLIC_URL"),
    )
    agent_uri = encode_self_card_uri(card)
    return jsonify({
        "network": NETWORK,
        "identity_registry": rc.identity_address,
        "chain_id": rc.chain_id,
        "signer": signer,
        "owned_agent_ids": owned,
        "card": card,
        "agent_uri": agent_uri,
        "agent_uri_bytes": len(agent_uri),
    })


@app.post("/api/self/register")
def self_register():
    """Phase 6: register TrustGate as an ERC-8004 agent.

    Body fields (all optional):
      axl_pubkey            — endpoints[name="axl"].endpoint to publish
      api_url               — endpoints[name="http"].endpoint to publish
      ens_name              — pinned in the card under .ens; if omitted,
                              we attempt to reverse-resolve the signer
      private_key           — overrides PRIVATE_KEY env var (NEVER log this)
      wait_for_receipt      — bool, default True
    """
    body = request.get_json(force=True, silent=True) or {}
    rc = client()
    pk = body.get("private_key") or os.getenv("PRIVATE_KEY", "")
    ens_name = body.get("ens_name")
    if not ens_name and pk:
        try:
            from eth_account import Account
            ens_name = default_ens_resolver().name_for(Account.from_key(pk).address)
        except Exception:
            ens_name = None
    card = build_self_card(
        ens_name=ens_name,
        axl_pubkey=body.get("axl_pubkey") or None,
        api_url=body.get("api_url") or os.getenv("TRUSTGATE_PUBLIC_URL"),
    )
    agent_uri = encode_self_card_uri(card)
    res = rc.send_register(
        agent_uri,
        private_key=pk or None,
        wait_for_receipt=bool(body.get("wait_for_receipt", True)),
    )
    res["card"] = card
    return jsonify(res)


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
