"""High-level hiring decision engine — discovery + reputation + ranking.

Phase 3 deliverable: given a capability and a budget, return a ranked list of
candidate agents drawn from the live ERC-8004 registry. Phase 4 will plug AXL
delivery into the top of this output; Phase 5 will write feedback after settlement.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

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
