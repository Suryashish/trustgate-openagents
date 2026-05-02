"""KeeperHub MCP wrapper for payment settlement + ERC-8004 feedback write-back.

Two surfaces:

    settle_payment(agent_wallet, amount_usdc, ...)
        Calls KeeperHub's MCP server to create + trigger a payment workflow.
        Falls back to a deterministic stub when no API key is configured, so
        the rest of the demo still runs end-to-end.

    write_feedback(agent_id, score, tags)
        Wraps RegistryClient.send_feedback. Produces a real onchain tx if
        PRIVATE_KEY is set; dry-run otherwise.

The KeeperHub HTTP shape follows the public docs at
https://docs.keeperhub.com/ai-tools (the actual endpoints used here are
documented in the README under `Configuration → KeeperHub`). The stub mode
exists because hackathon judges should be able to run the full pipeline without
needing a paid KeeperHub account — the API contract stays the same.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import requests

from config import KEEPERHUB_API_KEY
from registry_client import RegistryClient

log = logging.getLogger("keeper_client")

KEEPERHUB_MCP_URL = os.getenv("KEEPERHUB_MCP_URL", "http://127.0.0.1:8787")
KEEPERHUB_API_URL = os.getenv("KEEPERHUB_API_URL", "https://api.keeperhub.com/v1")
KEEPERHUB_NETWORK = os.getenv("KEEPERHUB_NETWORK", "base-sepolia")
KEEPERHUB_PAYER_TOKEN = os.getenv("KEEPERHUB_PAYER_TOKEN", "USDC")


@dataclass
class SettlementResult:
    mode: str                          # "stub" | "live-mcp" | "live-api"
    workflow_id: str
    status: str                        # "executed" | "pending" | "failed"
    agent_wallet: str
    amount: float
    token: str
    network: str
    tx_hash: Optional[str] = None
    audit_log: list[dict] = field(default_factory=list)
    error: Optional[str] = None
    elapsed_seconds: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _stub_settle(agent_wallet: str, amount: float, *, idempotency_key: str) -> SettlementResult:
    """Deterministic stub that produces a realistic-looking workflow record.

    The "tx_hash" is a content-derived sha256 prefix — *not* a real on-chain hash.
    The dashboard renders a clear "stub mode" badge so this can't be confused
    with a live settlement.
    """
    payload = f"{agent_wallet}:{amount}:{idempotency_key}".encode()
    digest = hashlib.sha256(payload).hexdigest()
    audit = [
        {"ts": time.time(), "step": "create_workflow", "ok": True},
        {"ts": time.time(), "step": "trigger_execution", "ok": True},
        {"ts": time.time(), "step": "wait_for_receipt", "ok": True, "confirmations": 3},
    ]
    return SettlementResult(
        mode="stub",
        workflow_id=f"wf_{digest[:16]}",
        status="executed",
        agent_wallet=agent_wallet,
        amount=float(amount),
        token=KEEPERHUB_PAYER_TOKEN,
        network=KEEPERHUB_NETWORK,
        tx_hash=f"0xstub{digest[:60]}",
        audit_log=audit,
    )


def _live_settle(agent_wallet: str, amount: float, *, idempotency_key: str) -> SettlementResult:
    """Real KeeperHub call.

    Tries the local MCP server first (if `KEEPERHUB_MCP_URL` is reachable),
    otherwise falls back to the HTTPS REST surface at `KEEPERHUB_API_URL`.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {KEEPERHUB_API_KEY}",
        "Idempotency-Key": idempotency_key,
    }
    workflow_payload = {
        "name": f"trustgate-payout-{idempotency_key[:8]}",
        "description": "TrustGate hire-loop settlement",
        "actions": [
            {
                "type": "transfer",
                "network": KEEPERHUB_NETWORK,
                "token": KEEPERHUB_PAYER_TOKEN,
                "to": agent_wallet,
                "amount": str(amount),
            }
        ],
        "trigger": "manual",
    }
    audit: list[dict] = []
    t0 = time.time()
    r = None
    used = "live-mcp"
    mcp_err: Optional[str] = None
    api_err: Optional[str] = None
    try:
        r = requests.post(f"{KEEPERHUB_MCP_URL}/workflows", json=workflow_payload, headers=headers, timeout=15)
    except requests.exceptions.RequestException as e:
        mcp_err = f"{type(e).__name__}: {str(e)[:140]}"
        log.info(f"local MCP unreachable ({mcp_err}); falling back to API")
        try:
            r = requests.post(f"{KEEPERHUB_API_URL}/workflows", json=workflow_payload, headers=headers, timeout=15)
            used = "live-api"
        except requests.exceptions.RequestException as e2:
            api_err = f"{type(e2).__name__}: {str(e2)[:140]}"

    if r is None:
        # Both transports failed before we got an HTTP response. Report a
        # structured error so the dashboard renders it cleanly instead of 500ing.
        return SettlementResult(
            mode="live-unreachable", workflow_id="", status="failed",
            agent_wallet=agent_wallet, amount=float(amount),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            error=(
                "Could not reach either KeeperHub transport. "
                f"MCP ({KEEPERHUB_MCP_URL}): {mcp_err}. "
                f"API ({KEEPERHUB_API_URL}): {api_err or 'not tried'}. "
                "Run a local KeeperHub MCP server, or set KEEPERHUB_API_URL to a reachable endpoint."
            ),
            audit_log=[
                {"ts": time.time(), "step": "create_workflow", "ok": False, "transport": "mcp", "error": mcp_err},
                *([{"ts": time.time(), "step": "create_workflow", "ok": False, "transport": "api", "error": api_err}] if api_err else []),
            ],
            elapsed_seconds=time.time() - t0,
        )

    if r.status_code >= 400:
        return SettlementResult(
            mode=used, workflow_id="", status="failed",
            agent_wallet=agent_wallet, amount=float(amount),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            error=f"create_workflow {r.status_code}: {r.text[:200]}",
            elapsed_seconds=time.time() - t0,
        )
    body = r.json()
    workflow_id = body.get("id") or body.get("workflow_id") or ""
    audit.append({"ts": time.time(), "step": "create_workflow", "ok": True, "workflow_id": workflow_id})

    base_url = KEEPERHUB_MCP_URL if used == "live-mcp" else KEEPERHUB_API_URL
    r2 = requests.post(f"{base_url}/workflows/{workflow_id}/trigger", json={}, headers=headers, timeout=20)
    if r2.status_code >= 400:
        audit.append({"ts": time.time(), "step": "trigger_execution", "ok": False, "code": r2.status_code})
        return SettlementResult(
            mode=used, workflow_id=workflow_id, status="failed",
            agent_wallet=agent_wallet, amount=float(amount),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            audit_log=audit,
            error=f"trigger_execution {r2.status_code}: {r2.text[:200]}",
            elapsed_seconds=time.time() - t0,
        )
    triggered = r2.json()
    audit.append({"ts": time.time(), "step": "trigger_execution", "ok": True})
    return SettlementResult(
        mode=used,
        workflow_id=workflow_id,
        status=triggered.get("status", "pending"),
        agent_wallet=agent_wallet, amount=float(amount),
        token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
        tx_hash=triggered.get("transaction_hash"),
        audit_log=audit,
        elapsed_seconds=time.time() - t0,
    )


def settle_payment(
    agent_wallet: str,
    amount_usdc: float,
    *,
    idempotency_key: Optional[str] = None,
    force_stub: bool = False,
) -> SettlementResult:
    """Pay an agent through KeeperHub. Returns a structured receipt.

    `idempotency_key` is auto-generated as a uuid4 if not provided. KeeperHub
    uses it to dedupe retries — passing the same key twice never double-pays.
    """
    if not agent_wallet:
        return SettlementResult(
            mode="stub", workflow_id="", status="failed",
            agent_wallet=agent_wallet or "0x0", amount=float(amount_usdc),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            error="agent_wallet is empty (set agent's setAgentWallet onchain or pass owner as fallback)",
        )
    idempotency_key = idempotency_key or uuid.uuid4().hex
    if force_stub or not KEEPERHUB_API_KEY:
        return _stub_settle(agent_wallet, float(amount_usdc), idempotency_key=idempotency_key)
    return _live_settle(agent_wallet, float(amount_usdc), idempotency_key=idempotency_key)


# ----- feedback write-back ---------------------------------------------------


@dataclass
class FeedbackResult:
    mode: str                    # "dry_run" | "live"
    agent_id: int
    score: float
    score_raw: int
    tags: dict[str, str]
    tx_hash: Optional[str] = None
    block_number: Optional[int] = None
    status: Optional[int] = None
    gas_used: Optional[int] = None
    receipt_error: Optional[str] = None
    tx: Optional[dict] = None     # populated only in dry_run
    calldata: Optional[str] = None
    to: Optional[str] = None      # populated in dry_run — Reputation Registry address
    elapsed_seconds: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def write_feedback(
    agent_id: int,
    score: float,
    *,
    tags: Optional[list[str]] = None,
    endpoint: str = "",
    feedback_uri: str = "",
    feedback_payload: Optional[dict] = None,
    private_key: Optional[str] = None,
    dry_run: bool = False,
    client: Optional[RegistryClient] = None,
    wait_for_receipt: bool = True,
) -> FeedbackResult:
    """Write a feedback row to the ERC-8004 Reputation Registry.

    `tags` is split: tags[0] → tag1, tags[1] → tag2 (the contract supports two
    parallel tag fields). `feedback_payload`, if provided, is hashed (sha-256)
    into `feedbackHash` so the on-chain record can be later cross-checked
    against an off-chain attestation.
    """
    rc = client or RegistryClient()
    tags = tags or ["trustgate"]
    tag1 = tags[0] if len(tags) > 0 else "trustgate"
    tag2 = tags[1] if len(tags) > 1 else ""
    fb_hash = b"\x00" * 32
    if feedback_payload is not None:
        fb_hash = hashlib.sha256(json.dumps(feedback_payload, sort_keys=True).encode()).digest()

    t0 = time.time()
    try:
        result = rc.send_feedback(
            agent_id, score,
            tag1=tag1, tag2=tag2,
            endpoint=endpoint, feedback_uri=feedback_uri,
            feedback_hash=fb_hash, value_decimals=0,
            private_key=private_key,
            dry_run=dry_run,
            wait_for_receipt=wait_for_receipt,
        )
    except Exception as e:
        return FeedbackResult(
            mode="error", agent_id=agent_id, score=score,
            score_raw=rc._score_to_raw(score),
            tags={"tag1": tag1, "tag2": tag2},
            error=f"{type(e).__name__}: {e}",
            elapsed_seconds=time.time() - t0,
        )

    out = FeedbackResult(
        mode=result["mode"],
        agent_id=agent_id,
        score=score,
        score_raw=rc._score_to_raw(score),
        tags={"tag1": tag1, "tag2": tag2},
        elapsed_seconds=time.time() - t0,
    )
    if result["mode"] == "dry_run":
        out.tx = result["tx"]
        out.calldata = result["calldata"]
        out.to = result.get("to")
    else:
        out.tx_hash = result["tx_hash"]
        out.block_number = result.get("block_number")
        out.status = result.get("status")
        out.gas_used = result.get("gas_used")
        out.receipt_error = result.get("receipt_error")
    return out
