"""TrustGate entry point — runs the full five-stage hiring loop end-to-end.

This wraps `complete_hire_loop` (Phase 5) so a single command demonstrates:
  1. Broadcast (the AXL nodes are assumed running — see scripts/start_axl_nodes.sh)
  2. Discover (Identity Registry) + 3. Evaluate (Reputation Registry)
  4. Hire & deliver (AXL A2A SendMessage with retry/fallback)
  5. Settle (KeeperHub stub or live) + write feedback (dry-run or live).

Run with sensible defaults against the local Phase-4 workers:

    PYTHONPATH=app .venv/bin/python -u app/main.py

Discover real agents on Base Sepolia, then deliver to the local workers as a
fallback (hire_and_deliver picks whichever candidate has an AXL endpoint):

    PYTHONPATH=app .venv/bin/python -u app/main.py --capability defi --budget 0.5
"""
from __future__ import annotations

import argparse
import json
import sys

from hiring import complete_hire_loop, find_best_agent


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="TrustGate — five-stage hiring loop demo")
    p.add_argument("--capability", default="", help="capability to search for (omit to use only `extra_candidates`)")
    p.add_argument("--service", default="uppercase_text", help="A2A service name on the worker")
    p.add_argument("--input", default="trustgate phase 6 demo", help="inner_request.params.input")
    p.add_argument("--budget", type=float, default=1.0)
    p.add_argument("--min-reputation", type=float, default=0.0)
    p.add_argument("--payment-amount-usdc", type=float, default=0.1)
    p.add_argument("--feedback-score", type=float, default=0.95)
    p.add_argument("--api-port", type=int, default=9002, help="local AXL bridge API port")
    p.add_argument("--max-attempts", type=int, default=3)
    p.add_argument("--write-feedback", action="store_true", help="actually write feedback (otherwise dry-run)")
    p.add_argument("--force-stub-settlement", action="store_true")
    args = p.parse_args(argv)

    if args.capability:
        candidates = find_best_agent(
            capability=args.capability,
            budget=args.budget,
            min_reputation=args.min_reputation,
        )
    else:
        candidates = []

    inner = {"params": {"input": args.input}}
    res = complete_hire_loop(
        capability=args.capability or "",
        service=args.service,
        inner_request=inner,
        candidates=candidates,
        api_port=args.api_port,
        max_attempts=args.max_attempts,
        payment_amount_usdc=args.payment_amount_usdc,
        feedback_score=args.feedback_score,
        write_feedback_onchain=args.write_feedback,
        force_stub_settlement=args.force_stub_settlement,
        verbose=True,
    )
    print(json.dumps(res.to_dict(), indent=2, default=str))
    return 0 if res.overall_status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
