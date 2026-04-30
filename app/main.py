"""TrustGate entry point: runs the five-stage hiring loop end-to-end."""
from axl_gateway import receive_job, send_task
from registry_client import query_agents, get_reputation
from scorer import rank
from keeper_client import settle_payment, write_feedback


def find_best_agent(capability: str, budget: float, min_reputation: float = 0.0):
    candidates = query_agents(capability)
    enriched = []
    for agent in candidates:
        rep = get_reputation(agent["agent_id"])
        if rep["score"] < min_reputation:
            continue
        enriched.append({
            "agent_id": agent["agent_id"],
            "axl_pubkey": agent["axl_pubkey"],
            "wallet": agent["wallet"],
            "reputation": rep["score"],
            "price": agent.get("price", 0.0),
            "latency_hint": agent.get("latency_hint", 0.0),
        })
    return rank(enriched)


def run_hiring_loop(job: dict):
    print(f"[1/5] Job received: {job['task']}")

    ranked = find_best_agent(
        capability=job["task"],
        budget=job["budget"],
        min_reputation=job.get("min_reputation", 0.0),
    )
    print(f"[2/5] Discovered {len(ranked)} candidates")
    print(f"[3/5] Top candidate: {ranked[0]['agent_id']} (score={ranked[0]['score']:.2f})")

    winner = ranked[0]
    result = send_task(winner["axl_pubkey"], job)
    print(f"[4/5] Task delivered, result received")

    settle_payment(winner["wallet"], job["budget"])
    write_feedback(winner["agent_id"], score=0.95, tags=["fast", "accurate"])
    print(f"[5/5] Payment settled and reputation updated")
    return result


if __name__ == "__main__":
    sample_job = {
        "task": "summarise_documents",
        "input": "ipfs://Qm...",
        "budget": 0.5,
        "deadline": 300,
        "min_reputation": 0.7,
    }
    run_hiring_loop(sample_job)
