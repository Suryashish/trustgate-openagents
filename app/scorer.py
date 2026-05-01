"""Trust-weighted ranker for ERC-8004 candidates.

Blueprint formula (s. 3.1, scorer.py):
    score = 0.60 * reputation + 0.20 * price_score + 0.20 * response_score

Where:
  * reputation     in [0, 1] — normalised average from ReputationRegistry.
  * price_score    in [0, 1] — how cheap the agent is *relative to budget*:
                   `clip(1 - price/budget, 0, 1)`. Free → 1.0, equal-to-budget → 0.0,
                   over-budget candidates are dropped before they reach this stage.
  * response_score in [0, 1] — derived from past completion ratio / latency hint.
                   We use `1 / (1 + latency_seconds / 60)` as a smooth proxy until
                   real latency telemetry is wired up in Phase 5.

Pure Python, no chain calls. Inputs come from `registry_client.get_reputation()`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


W_REPUTATION = 0.60
W_PRICE = 0.20
W_LATENCY = 0.20


@dataclass
class ScoredCandidate:
    agent_id: int
    name: str | None
    reputation: float
    price: float
    latency_hint: float
    feedback_count: int
    trust_level: int
    score: float
    breakdown: dict[str, float] = field(default_factory=dict)
    extras: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def _clip(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def price_score(price: float, budget: float) -> float:
    """Score in [0, 1]: 1.0 means free, 0.0 means at budget; over-budget callers should pre-filter."""
    if budget <= 0:
        return 1.0 if price <= 0 else 0.0
    return _clip(1.0 - (price / budget))


def latency_score(latency_seconds: float) -> float:
    """Smooth decay: 0s -> 1.0, 60s -> 0.5, 300s -> ~0.17."""
    if latency_seconds <= 0:
        return 1.0
    return _clip(1.0 / (1.0 + latency_seconds / 60.0))


def score_candidate(reputation: float, price: float, budget: float, latency_seconds: float) -> tuple[float, dict[str, float]]:
    p = price_score(price, budget)
    l = latency_score(latency_seconds)
    r = _clip(reputation)
    breakdown = {
        "reputation": r,
        "price_score": p,
        "latency_score": l,
        "w_reputation": W_REPUTATION * r,
        "w_price": W_PRICE * p,
        "w_latency": W_LATENCY * l,
    }
    return W_REPUTATION * r + W_PRICE * p + W_LATENCY * l, breakdown


def rank_candidates(
    candidates: list[dict],
    *,
    budget: float = 1.0,
    min_reputation: float = 0.0,
    require_feedback: bool = False,
) -> list[ScoredCandidate]:
    """Rank a list of candidate dicts. Each candidate must have:

        agent_id, name?, reputation (float 0..1), price (float),
        latency_hint (float seconds), feedback_count (int), trust_level (int)

    Over-budget candidates are dropped. If `require_feedback`, only agents with
    at least one feedback record pass the gate.
    """
    out: list[ScoredCandidate] = []
    for c in candidates:
        rep = float(c.get("reputation", 0.0))
        price = float(c.get("price", 0.0))
        latency = float(c.get("latency_hint", 0.0))
        feedback_count = int(c.get("feedback_count", 0))
        if rep < min_reputation:
            continue
        if budget > 0 and price > budget:
            continue
        if require_feedback and feedback_count <= 0:
            continue
        score, breakdown = score_candidate(rep, price, budget, latency)
        out.append(ScoredCandidate(
            agent_id=int(c["agent_id"]),
            name=c.get("name"),
            reputation=rep,
            price=price,
            latency_hint=latency,
            feedback_count=feedback_count,
            trust_level=int(c.get("trust_level", 0)),
            score=score,
            breakdown=breakdown,
            extras={k: v for k, v in c.items() if k not in {
                "agent_id", "name", "reputation", "price", "latency_hint",
                "feedback_count", "trust_level",
            }},
        ))
    out.sort(key=lambda c: c.score, reverse=True)
    return out


# ---- legacy shim used by the Phase-1 main.py -------------------------------

def rank(candidates: list[dict]) -> list[dict]:
    """Backwards-compat wrapper; forwards to rank_candidates with default budget=1.0."""
    return [c.to_dict() for c in rank_candidates(candidates, budget=1.0)]


def explain(top: ScoredCandidate, runner_up: ScoredCandidate | None) -> str:
    """Human-readable rationale (Day 7 polish — useful for the dashboard now)."""
    if runner_up is None:
        return f"Selected #{top.agent_id} (score {top.score:.2f}); only candidate in scope."
    why = []
    if top.reputation > runner_up.reputation + 1e-3:
        why.append(f"higher reputation ({top.reputation:.2f} vs {runner_up.reputation:.2f})")
    if top.price < runner_up.price - 1e-9:
        why.append(f"lower price (${top.price:.4f} vs ${runner_up.price:.4f})")
    if top.latency_hint < runner_up.latency_hint - 1e-3:
        why.append(f"faster ({top.latency_hint:.1f}s vs {runner_up.latency_hint:.1f}s)")
    reason = "; ".join(why) if why else "marginally better aggregate"
    return (
        f"Selected #{top.agent_id} (score {top.score:.2f}) over #{runner_up.agent_id} "
        f"(score {runner_up.score:.2f}) because: {reason}."
    )
