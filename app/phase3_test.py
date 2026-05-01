"""Phase 3 CLI: end-to-end discovery + reputation + ranking against Base Sepolia.

Examples:
  python phase3_test.py --capability swap            # rank "swap" agents
  python phase3_test.py --capability defi --budget 1 # custom budget
  python phase3_test.py --reputation 17              # raw reputation read
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from hiring import find_best_agent, select_top
from registry_client import RegistryClient


def cmd_reputation(args) -> int:
    rc = RegistryClient()
    rep = rc.get_reputation(args.reputation)
    print(json.dumps(rep, indent=2, default=str))
    fb = rc.get_recent_feedback(args.reputation, limit=args.feedback_limit)
    if fb:
        print("\nRecent feedback:")
        for r in fb:
            print(f"  [{r['index']}] from {r['client'][:10]}…  score={r['score']:.3f}  trust={r['trust_level']}  tag={r['tag']!r}")
    else:
        print("\n(no feedback rows)")
    return 0


def cmd_rank(args) -> int:
    print(f"[phase3] capability={args.capability!r}  budget={args.budget}  min_rep={args.min_reputation}")
    t0 = time.time()
    ranked = find_best_agent(
        capability=args.capability,
        budget=args.budget,
        min_reputation=args.min_reputation,
        require_feedback=args.require_feedback,
        limit_candidates=args.limit,
        default_price=args.default_price,
        default_latency=args.default_latency,
        verbose=args.verbose,
    )
    dt = time.time() - t0
    print(f"[phase3] {len(ranked)} candidate(s) ranked in {dt:.2f}s\n")
    for i, c in enumerate(ranked):
        bd = c.breakdown
        print(f"  [{i}] #{c.agent_id} {c.name or '(no name)'}  score={c.score:.3f}")
        print(f"        reputation={c.reputation:.3f} (count={c.feedback_count}, trust={c.trust_level})  "
              f"price=${c.price:.4f}  latency_hint={c.latency_hint:.0f}s")
        print(f"        breakdown:  rep×{bd['w_reputation']:.3f}  +  price×{bd['w_price']:.3f}  +  lat×{bd['w_latency']:.3f}")
    print()
    winner, runner_up, why = select_top(ranked)
    print(why)
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--capability", help="capability tag to filter on (lowercase)")
    p.add_argument("--budget", type=float, default=1.0)
    p.add_argument("--min-reputation", type=float, default=0.0)
    p.add_argument("--require-feedback", action="store_true",
                   help="drop candidates with zero feedback rows")
    p.add_argument("--limit", type=int, default=25, help="max candidates to consider before scoring")
    p.add_argument("--default-price", type=float, default=0.0)
    p.add_argument("--default-latency", type=float, default=30.0)
    p.add_argument("--reputation", type=int, help="ALT: dump raw reputation for one agent_id")
    p.add_argument("--feedback-limit", type=int, default=10)
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()
    if args.reputation is not None:
        return cmd_reputation(args)
    if not args.capability:
        p.error("either --capability or --reputation is required")
    return cmd_rank(args)


if __name__ == "__main__":
    sys.exit(main())
