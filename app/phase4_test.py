"""Phase 4 end-to-end driver: discovery → ranking → A2A delivery → fallback.

Two demo modes:

  --demo happy
      Single A2A round-trip to a local worker.
      Requires: AXL n1+n2 up, phase4_worker.py listening on :9014.

  --demo fallback
      Try worker-b first; it drops the request; orchestrator falls back to
      worker-c. Requires: AXL n1+n2+n3 up, two workers running.

  Or use the building blocks directly:

  python phase4_test.py --capability defi --task uppercase_text --input "hello"
      Runs find_best_agent for the capability and tries each candidate in rank
      order. Real onchain candidates won't have AXL endpoints, so this exercises
      the "skipped — no AXL endpoint" path until it falls through to whatever
      `--extra-pubkey` you pass.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from axl_gateway import fetch_agent_card, send_a2a_task, topology, A2AError
from hiring import hire_and_deliver


def _candidate(name: str, pubkey: str, *, agent_id: int = -1, reputation: float = 1.0) -> dict:
    return {
        "agent_id": agent_id,
        "name": name,
        "axl_pubkey": pubkey,
        "endpoints": [{"name": "axl", "endpoint": pubkey}],
        "reputation": reputation,
        "feedback_count": 0,
        "trust_level": 0,
        "price": 0.0,
        "latency_hint": 30.0,
    }


def cmd_happy(args) -> int:
    n2 = topology(args.b_port)
    print(f"[happy] worker-b pubkey: {n2['our_public_key']}")
    extra = [_candidate("worker-b", n2["our_public_key"])]
    out = hire_and_deliver(
        capability="phase4-happy",
        service=args.service,
        inner_request={"params": {"input": args.input}},
        candidates=[],  # skip discovery
        extra_candidates=extra,
        a2a_timeout=args.timeout,
        api_port=args.a_port,
        verbose=True,
    )
    print(json.dumps(out.to_dict(), indent=2, default=str))
    return 0 if out.final_reply is not None else 1


def cmd_fallback(args) -> int:
    n2 = topology(args.b_port)
    n3 = topology(args.c_port)
    print(f"[fallback] worker-b (will drop): {n2['our_public_key'][:32]}…")
    print(f"[fallback] worker-c (will reply): {n3['our_public_key'][:32]}…")
    extra = [
        _candidate("worker-b", n2["our_public_key"], reputation=0.95),  # ranks first; will time out
        _candidate("worker-c", n3["our_public_key"], reputation=0.80),  # ranks second; reply target
    ]
    out = hire_and_deliver(
        capability="phase4-fallback",
        service=args.service,
        inner_request={"params": {"input": args.input}},
        candidates=[],
        extra_candidates=extra,
        a2a_timeout=args.timeout,
        api_port=args.a_port,
        verbose=True,
    )
    print(json.dumps(out.to_dict(), indent=2, default=str))
    if out.winner_index != 1:
        print("FAIL — expected worker-c (idx 1) to win after worker-b dropped", file=sys.stderr)
        return 1
    if len(out.attempts) < 2 or out.attempts[0].ok:
        print("FAIL — expected first attempt to fail and fallback to fire", file=sys.stderr)
        return 1
    print("PASS — fallback path verified")
    return 0


def cmd_card(args) -> int:
    card = fetch_agent_card(args.peer, api_port=args.a_port)
    print(json.dumps(card, indent=2))
    return 0


def cmd_send(args) -> int:
    try:
        reply = send_a2a_task(
            args.peer, args.service,
            {"params": {"input": args.input}},
            api_port=args.a_port, timeout=args.timeout,
        )
    except A2AError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(json.dumps(reply, indent=2))
    return 0


def cmd_discover(args) -> int:
    extras = []
    if args.extra_pubkey:
        for p in args.extra_pubkey:
            extras.append(_candidate("local-extra", p, reputation=0.5))
    out = hire_and_deliver(
        capability=args.capability,
        service=args.task,
        inner_request={"params": {"input": args.input}},
        budget=args.budget,
        min_reputation=args.min_reputation,
        extra_candidates=extras,
        a2a_timeout=args.timeout,
        api_port=args.a_port,
        verbose=True,
    )
    print(json.dumps(out.to_dict(), indent=2, default=str))
    return 0 if out.final_reply is not None else 2


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--a-port", type=int, default=9002, help="our local AXL bridge api_port")
    p.add_argument("--b-port", type=int, default=9012, help="worker-b's AXL bridge api_port")
    p.add_argument("--c-port", type=int, default=9022, help="worker-c's AXL bridge api_port")
    p.add_argument("--service", default="uppercase_text")
    p.add_argument("--input", default="trustgate phase 4 ok")
    p.add_argument("--timeout", type=float, default=10.0)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("happy", help="single round-trip to worker-b")
    sub.add_parser("fallback", help="worker-b drops → fall back to worker-c")

    s = sub.add_parser("card", help="GET the remote peer's A2A agent card")
    s.add_argument("peer")

    s = sub.add_parser("send", help="raw send_a2a_task to a specific peer pubkey")
    s.add_argument("peer")

    s = sub.add_parser("discover", help="discover via Identity Registry then deliver")
    s.add_argument("--capability", required=True)
    s.add_argument("--task", default="uppercase_text", help="A2A service to invoke")
    s.add_argument("--budget", type=float, default=1.0)
    s.add_argument("--min-reputation", type=float, default=0.0)
    s.add_argument("--extra-pubkey", action="append",
                   help="add a local AXL pubkey as an extra candidate (repeatable)")

    args = p.parse_args()
    return {
        "happy": cmd_happy,
        "fallback": cmd_fallback,
        "card": cmd_card,
        "send": cmd_send,
        "discover": cmd_discover,
    }[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
