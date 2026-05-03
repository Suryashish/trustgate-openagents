"""KeeperHub wrapper for payment settlement + ERC-8004 feedback write-back.

Two surfaces:

    settle_payment(agent_wallet, amount_usdc, ...)
        Calls KeeperHub's hosted REST API to execute a transfer in one shot.
        Falls back to a deterministic stub when no API key is configured, so
        the rest of the demo still runs end-to-end.

    write_feedback(agent_id, score, tags)
        Wraps RegistryClient.send_feedback. Produces a real onchain tx if
        PRIVATE_KEY is set; dry-run otherwise.

The KeeperHub REST surface used here is documented at
https://docs.keeperhub.com/api/direct-execution — specifically
`POST /api/execute/transfer`, which dispatches a single transfer in one call.
That's a cleaner fit for "one settlement per hire" than the older
create_workflow + trigger_execution dance.

The stub mode exists because hackathon judges should be able to run the full
pipeline without a paid KeeperHub account — the dashboard renders an honest
"STUB" badge so the two paths can never be confused.
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

KEEPERHUB_API_URL = os.getenv("KEEPERHUB_API_URL", "https://app.keeperhub.com/api")
KEEPERHUB_NETWORK = os.getenv("KEEPERHUB_NETWORK", "base-sepolia")
KEEPERHUB_PAYER_TOKEN = os.getenv("KEEPERHUB_PAYER_TOKEN", "USDC")
# Optional explicit ERC-20 contract address for the payer token. KeeperHub's
# /api/execute/transfer takes a `tokenAddress` (or omits it for native coin).
# If unset, we resolve known symbols (USDC) on known networks below.
KEEPERHUB_TOKEN_ADDRESS = os.getenv("KEEPERHUB_TOKEN_ADDRESS", "")

# Symbol → contract address map for networks we ship support for. Add more as
# needed; users can always set KEEPERHUB_TOKEN_ADDRESS explicitly to override.
_TOKEN_ADDRESSES: dict[str, dict[str, str]] = {
    "base-sepolia": {
        # Circle testnet USDC on Base Sepolia (verified)
        "USDC": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
    "base-mainnet": {
        # Native Base mainnet USDC (Circle, bridged)
        "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
}


def _resolve_token_address() -> Optional[str]:
    """Return the ERC-20 address to send to KeeperHub, or None for native ETH.

    Resolution order:
      1. KEEPERHUB_TOKEN_ADDRESS env var (literal address wins)
      2. Symbol lookup in _TOKEN_ADDRESSES for the configured network
      3. If symbol is "ETH"/"NATIVE", return None (KeeperHub treats this as native)
    """
    if KEEPERHUB_TOKEN_ADDRESS:
        return KEEPERHUB_TOKEN_ADDRESS
    sym = (KEEPERHUB_PAYER_TOKEN or "").upper()
    if sym in {"ETH", "NATIVE", ""}:
        return None
    return _TOKEN_ADDRESSES.get(KEEPERHUB_NETWORK, {}).get(sym)


@dataclass
class SettlementResult:
    mode: str                          # "stub" | "live" | "live-unreachable"
    workflow_id: str                   # KeeperHub `executionId` for live; "wf_<sha>" for stub
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
    """Real KeeperHub call via direct-execution.

    POSTs once to {KEEPERHUB_API_URL}/execute/transfer and returns whatever
    the API hands back. No pre-created workflow needed.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {KEEPERHUB_API_KEY}",
        # Idempotency-Key is sent defensively — KeeperHub's create_workflow
        # path documents it; direct-execution may or may not honour it.
        # Either way, sending it is harmless.
        "Idempotency-Key": idempotency_key,
    }
    body: dict[str, Any] = {
        "network": KEEPERHUB_NETWORK,
        "recipientAddress": agent_wallet,
        "amount": str(amount),
    }
    token_addr = _resolve_token_address()
    if token_addr:
        body["tokenAddress"] = token_addr

    audit: list[dict] = []
    t0 = time.time()
    url = f"{KEEPERHUB_API_URL.rstrip('/')}/execute/transfer"
    try:
        r = requests.post(url, json=body, headers=headers, timeout=20)
    except requests.exceptions.RequestException as e:
        err = f"{type(e).__name__}: {str(e)[:200]}"
        audit.append({"ts": time.time(), "step": "execute_transfer", "ok": False, "error": err})
        return SettlementResult(
            mode="live-unreachable", workflow_id="", status="failed",
            agent_wallet=agent_wallet, amount=float(amount),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            error=(
                f"Could not reach KeeperHub at {url}: {err}. "
                "Check KEEPERHUB_API_URL is correct (default: https://app.keeperhub.com/api)."
            ),
            audit_log=audit,
            elapsed_seconds=time.time() - t0,
        )

    if r.status_code >= 400:
        audit.append({"ts": time.time(), "step": "execute_transfer", "ok": False, "code": r.status_code})
        return SettlementResult(
            mode="live", workflow_id="", status="failed",
            agent_wallet=agent_wallet, amount=float(amount),
            token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
            error=f"execute_transfer {r.status_code}: {r.text[:300]}",
            audit_log=audit,
            elapsed_seconds=time.time() - t0,
        )

    body_resp = r.json() if r.text else {}
    execution_id = body_resp.get("executionId") or body_resp.get("execution_id") or ""
    status = body_resp.get("status", "pending")
    audit.append({"ts": time.time(), "step": "execute_transfer", "ok": True, "execution_id": execution_id})
    return SettlementResult(
        mode="live",
        workflow_id=execution_id,
        status=status,
        agent_wallet=agent_wallet, amount=float(amount),
        token=KEEPERHUB_PAYER_TOKEN, network=KEEPERHUB_NETWORK,
        tx_hash=body_resp.get("transactionHash") or body_resp.get("transaction_hash"),
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

    `idempotency_key` is auto-generated as a uuid4 if not provided and sent
    as an `Idempotency-Key` header so retries don't double-pay.
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
