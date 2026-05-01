"""High-level hiring decision engine — discovery + reputation + ranking + delivery.

Phase 3: given a capability and a budget, returns a ranked list of candidate
agents drawn from the live ERC-8004 registry.

Phase 4: `hire_and_deliver(...)` extends this — it actually ships the task to
the chosen worker over AXL A2A, with retry/fallback to the runner-up when the
first candidate doesn't reply.

Phase 5 will plug KeeperHub settlement + reputation write-back onto the end.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

from axl_gateway import A2AError, send_a2a_task
from registry_client import RegistryClient
from scorer import ScoredCandidate, rank_candidates, explain


def _candidate_from_agent(agent, rep: dict, *, default_price: float, default_latency: float) -> dict:
    """Project an Agent + reputation summary into the dict shape the scorer wants."""
    return {
        "agent_id": agent.agent_id,
        "name": agent.name,
        "owner": agent.owner,
        "agent_uri": agent.agent_uri,
        "endpoints": agent.endpoints,
        "capabilities": agent.capabilities,
        "reputation": rep["score"],
        "feedback_count": rep["count"],
        "trust_level": rep.get("trust_level", 0),
        "average_raw": rep.get("average_raw", 0),
        "price": default_price,        # placeholder until agent cards expose pricing
        "latency_hint": default_latency,
    }


def find_best_agent(
    capability: str,
    *,
    budget: float = 1.0,
    min_reputation: float = 0.0,
    require_feedback: bool = False,
    only_active: bool = True,
    limit_candidates: int = 25,
    default_price: float = 0.0,
    default_latency: float = 30.0,
    client: Optional[RegistryClient] = None,
    verbose: bool = False,
) -> list[ScoredCandidate]:
    """Phase 3 entry point: discover, hydrate, rank.

    `default_price` / `default_latency` apply when the agent card doesn't
    advertise pricing yet (most don't on Sepolia). Per-agent overrides will go
    through the agent card in Phase 4.
    """
    rc = client or RegistryClient()
    candidates_raw = rc.query_agents(
        capability=capability,
        limit=limit_candidates,
        only_active=only_active,
        require_card=True,
        verbose=verbose,
    )
    enriched: list[dict] = []
    for ag in candidates_raw:
        rep = rc.get_reputation(ag.agent_id)
        enriched.append(_candidate_from_agent(ag, rep, default_price=default_price, default_latency=default_latency))
    return rank_candidates(
        enriched,
        budget=budget,
        min_reputation=min_reputation,
        require_feedback=require_feedback,
    )


def select_top(ranked: Iterable[ScoredCandidate]) -> tuple[Optional[ScoredCandidate], Optional[ScoredCandidate], str]:
    """Return (winner, runner_up, explanation). Either may be None if not enough candidates."""
    items = list(ranked)
    winner = items[0] if items else None
    runner_up = items[1] if len(items) > 1 else None
    if winner is None:
        return None, None, "No candidates met the filters."
    return winner, runner_up, explain(winner, runner_up)


# ----- Phase 4: actual delivery over AXL A2A --------------------------------


@dataclass
class DeliveryAttempt:
    candidate: dict[str, Any]   # the candidate as a plain dict (works for synthetic + ScoredCandidate)
    ok: bool
    reply: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    elapsed_seconds: float = 0.0


@dataclass
class HireResult:
    capability: str
    service: str
    inner_request: dict[str, Any]
    candidates: list[dict[str, Any]]
    attempts: list[DeliveryAttempt] = field(default_factory=list)
    winner_index: Optional[int] = None
    final_reply: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability,
            "service": self.service,
            "inner_request": self.inner_request,
            "candidates": self.candidates,
            "attempts": [a.__dict__ for a in self.attempts],
            "winner_index": self.winner_index,
            "final_reply": self.final_reply,
        }


def _candidate_axl_pubkey(c: dict[str, Any]) -> Optional[str]:
    """Extract an AXL pubkey from an agent's card endpoints, if any.

    Convention: an agent that wants to receive AXL jobs publishes an endpoint
    with `name == "axl"` and the endpoint string set to its 64-char hex pubkey.
    Phase 5 will start writing this back when registering TrustGate's own agent.
    """
    if c.get("axl_pubkey"):
        return str(c["axl_pubkey"])
    for ep in c.get("endpoints") or []:
        if (ep.get("name") or "").lower() == "axl" and ep.get("endpoint"):
            v = ep["endpoint"].strip().lower()
            if len(v) == 64 and all(ch in "0123456789abcdef" for ch in v):
                return v
    return None


def _candidate_to_dict(c: Any) -> dict[str, Any]:
    if isinstance(c, dict):
        return dict(c)
    if hasattr(c, "to_dict"):
        return c.to_dict()
    return dict(c.__dict__)


def hire_and_deliver(
    capability: str,
    service: str,
    inner_request: dict[str, Any],
    *,
    candidates: Optional[list[Any]] = None,
    extra_candidates: Optional[list[dict[str, Any]]] = None,
    budget: float = 1.0,
    min_reputation: float = 0.0,
    require_feedback: bool = False,
    a2a_timeout: float = 15.0,
    max_attempts: int = 3,
    api_port: int = 9002,
    client: Optional[RegistryClient] = None,
    verbose: bool = False,
) -> HireResult:
    """Phase 4 entry point: discover, rank, and ship the task — with fallback.

    `service` is the A2A service name (e.g. "uppercase_text") and `inner_request`
    is the JSON-RPC params the worker will see.

    Candidate selection logic (in order):
      1. If `candidates` is given, use it directly (already-ranked list).
      2. Otherwise, run `find_best_agent(capability, ...)`.
      3. Prepend `extra_candidates` (synthetic local workers, useful for demos
         and for the future case where TrustGate-attached workers haven't yet
         been registered onchain).

    Each candidate is tried in rank order until one returns a successful A2A
    reply, up to `max_attempts`. Candidates without an `axl_pubkey` are skipped
    with a recorded reason (so the dashboard can show "skipped — no AXL endpoint").
    """
    if candidates is None:
        candidates = find_best_agent(
            capability=capability,
            budget=budget,
            min_reputation=min_reputation,
            require_feedback=require_feedback,
            client=client,
            verbose=verbose,
        )
    candidate_dicts: list[dict[str, Any]] = list(extra_candidates or [])
    candidate_dicts.extend(_candidate_to_dict(c) for c in candidates)

    out = HireResult(
        capability=capability, service=service, inner_request=inner_request,
        candidates=candidate_dicts,
    )

    attempts_used = 0
    for idx, cand in enumerate(candidate_dicts):
        if attempts_used >= max_attempts:
            break
        pk = _candidate_axl_pubkey(cand)
        if not pk:
            out.attempts.append(DeliveryAttempt(
                candidate=cand, ok=False,
                error="no AXL endpoint advertised; skipping",
            ))
            continue
        attempts_used += 1
        if verbose:
            print(f"[hire] attempt {attempts_used}: candidate #{cand.get('agent_id', '?')} "
                  f"({cand.get('name')}) → AXL {pk[:16]}…", flush=True)
        t0 = time.time()
        try:
            reply = send_a2a_task(pk, service, inner_request, api_port=api_port, timeout=a2a_timeout)
            elapsed = time.time() - t0
            out.attempts.append(DeliveryAttempt(
                candidate=cand, ok=True, reply=reply, elapsed_seconds=elapsed,
            ))
            out.winner_index = idx
            out.final_reply = reply
            if verbose:
                print(f"[hire]   ✓ delivered in {elapsed:.2f}s: {reply}", flush=True)
            return out
        except A2AError as e:
            elapsed = time.time() - t0
            out.attempts.append(DeliveryAttempt(
                candidate=cand, ok=False, error=str(e), elapsed_seconds=elapsed,
            ))
            if verbose:
                print(f"[hire]   ✗ failed after {elapsed:.2f}s: {e}", flush=True)
            continue

    return out


# ----- Phase 5: full hire → deliver → settle → feedback loop ----------------


@dataclass
class CompleteHireResult:
    hire: HireResult
    settlement: Optional[dict] = None
    feedback: Optional[dict] = None
    overall_status: str = "unknown"   # "ok" | "delivery_failed" | "settlement_failed" | "feedback_failed"
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "hire": self.hire.to_dict(),
            "settlement": self.settlement,
            "feedback": self.feedback,
            "overall_status": self.overall_status,
            "error": self.error,
        }


def complete_hire_loop(
    capability: str,
    service: str,
    inner_request: dict[str, Any],
    *,
    candidates: Optional[list[Any]] = None,
    extra_candidates: Optional[list[dict[str, Any]]] = None,
    a2a_timeout: float = 15.0,
    max_attempts: int = 3,
    api_port: int = 9002,
    payment_amount_usdc: float = 0.1,
    feedback_score: float = 0.95,
    feedback_tags: Optional[list[str]] = None,
    feedback_endpoint: Optional[str] = None,
    write_feedback_onchain: bool = True,
    private_key: Optional[str] = None,
    force_stub_settlement: bool = False,
    client: Optional[RegistryClient] = None,
    verbose: bool = False,
) -> CompleteHireResult:
    """Phase 5 entry point: discover → deliver → settle → feedback.

    Returns a structured `CompleteHireResult` with one entry per stage. If a
    stage fails, downstream stages are skipped and `overall_status` reflects
    the failure point.
    """
    hire = hire_and_deliver(
        capability=capability, service=service, inner_request=inner_request,
        candidates=candidates, extra_candidates=extra_candidates,
        a2a_timeout=a2a_timeout, max_attempts=max_attempts,
        api_port=api_port, client=client, verbose=verbose,
    )
    out = CompleteHireResult(hire=hire)
    if hire.final_reply is None or hire.winner_index is None:
        out.overall_status = "delivery_failed"
        out.error = "no candidate returned a successful A2A reply"
        return out

    winner = hire.candidates[hire.winner_index]
    agent_wallet = (
        winner.get("wallet")
        or winner.get("agent_wallet")
        or winner.get("owner")  # fallback when getAgentWallet is 0x0
        or "0x0000000000000000000000000000000000000000"
    )

    # Local import: keeper_client imports registry_client at module load, so
    # importing it at the top of this file would create a cycle.
    from keeper_client import settle_payment, write_feedback as do_write_feedback
    if verbose:
        print(f"[settle] paying {agent_wallet} {payment_amount_usdc} USDC", flush=True)
    settle = settle_payment(
        agent_wallet, payment_amount_usdc,
        force_stub=force_stub_settlement,
    )
    out.settlement = settle.to_dict()
    if settle.status not in ("executed", "pending"):
        out.overall_status = "settlement_failed"
        out.error = settle.error or f"settlement returned status={settle.status!r}"
        return out

    if not write_feedback_onchain:
        out.overall_status = "ok"
        return out

    agent_id = winner.get("agent_id")
    if agent_id is None or int(agent_id) < 0:
        out.feedback = {
            "mode": "skipped",
            "reason": "synthetic candidate has no on-chain agent_id",
        }
        out.overall_status = "ok"
        return out

    payload = {
        "service": service, "inner_request": inner_request,
        "winner_agent_id": int(agent_id), "amount_usdc": payment_amount_usdc,
        "settlement_workflow": settle.workflow_id, "reply": hire.final_reply,
    }
    fb = do_write_feedback(
        int(agent_id), feedback_score,
        tags=feedback_tags or ["trustgate", service],
        endpoint=feedback_endpoint or "",
        feedback_payload=payload,
        private_key=private_key,
        client=client,
    )
    out.feedback = fb.to_dict()
    if fb.error:
        out.overall_status = "feedback_failed"
        out.error = fb.error
        return out
    out.overall_status = "ok"
    return out
