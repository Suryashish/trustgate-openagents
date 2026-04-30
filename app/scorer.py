"""Pure-Python ranker: 60% reputation, 20% price, 20% response history."""

W_REPUTATION = 0.6
W_PRICE = 0.2
W_LATENCY = 0.2


def score_candidate(reputation: float, price: float, latency_hint: float) -> float:
    price_score = max(0.0, 1.0 - price)
    latency_score = max(0.0, 1.0 - latency_hint)
    return (
        W_REPUTATION * reputation
        + W_PRICE * price_score
        + W_LATENCY * latency_score
    )


def rank(candidates: list[dict]) -> list[dict]:
    """Each candidate dict: {agent_id, reputation, price, latency_hint}."""
    scored = [
        {**c, "score": score_candidate(c["reputation"], c["price"], c["latency_hint"])}
        for c in candidates
    ]
    return sorted(scored, key=lambda c: c["score"], reverse=True)
