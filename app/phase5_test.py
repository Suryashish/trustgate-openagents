"""Phase 5 driver: settlement + reputation write-back + complete hire loop.

Subcommands:

    python phase5_test.py settle <agent_wallet> [--amount 0.1]
        Run settle_payment in stub mode (or live if KEEPERHUB_API_KEY is set).

    python phase5_test.py feedback <agent_id> [--score 0.95] [--tag trustgate] ...
        Build (and optionally sign) a giveFeedback tx. Dry-run by default;
        broadcasts to Base Sepolia when PRIVATE_KEY is set in the env.

    python phase5_test.py loop
        Drive complete_hire_loop end-to-end against the local Phase-4 workers.
        Settlement runs in stub mode unless --keeper-live is passed.
        Feedback is skipped because the local mock has no on-chain agent_id —
        use `loop --target-agent-id <id>` to point feedback at a real agent.

    python phase5_test.py status
        Print whether KEEPERHUB_API_KEY and PRIVATE_KEY are set, and (if PK is
        set) the signer's Base Sepolia balance.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from axl_gateway import topology
from hiring import complete_hire_loop
from keeper_client import settle_payment, write_feedback, FeedbackResult, SettlementResult
from registry_client import RegistryClient


def cmd_status(args) -> int:
    rc = RegistryClient()
    has_pk = bool(os.getenv("PRIVATE_KEY"))
    has_kh = bool(os.getenv("KEEPERHUB_API_KEY"))
    print(f"NETWORK={os.getenv('NETWORK', 'base-sepolia')}  chain_id={rc.chain_id}  head={rc.w3.eth.block_number}")
    print(f"KEEPERHUB_API_KEY: {'✓ live' if has_kh else '✗ stub mode'}")
    print(f"PRIVATE_KEY:       {'✓ live' if has_pk else '✗ dry-run mode'}")
    if has_pk:
        from eth_account import Account
        acct = Account.from_key(os.getenv("PRIVATE_KEY"))
        balance_wei = rc.w3.eth.get_balance(acct.address)
        eth = float(rc.w3.from_wei(balance_wei, "ether"))
        print(f"signer:            {acct.address}  balance={eth:.6f} ETH")
        if eth < 0.0005:
            print("                   ⚠️  not enough Sepolia ETH for a write — see https://www.alchemy.com/faucets/base-sepolia")
    return 0


def cmd_settle(args) -> int:
    res: SettlementResult = settle_payment(
        args.wallet, args.amount,
        idempotency_key=args.key,
        force_stub=args.force_stub,
    )
    print(json.dumps(res.to_dict(), indent=2, default=str))
    if res.status not in ("executed", "pending"):
        return 1
    print(f"\n✓ settlement {res.status} (mode={res.mode})  workflow={res.workflow_id}")
    if res.tx_hash and not res.tx_hash.startswith("0xstub"):
        print(f"  tx: {res.tx_hash}")
    return 0


def cmd_feedback(args) -> int:
    res: FeedbackResult = write_feedback(
        args.agent_id, args.score,
        tags=args.tag or ["trustgate"],
        endpoint=args.endpoint,
        feedback_uri=args.feedback_uri,
        feedback_payload={"trustgate_test": True, "args": vars(args)},
        client=RegistryClient(),
    )
    print(json.dumps(res.to_dict(), indent=2, default=str))
    if res.error:
        return 1
    if res.mode == "dry_run":
        print(f"\n[dry-run] tx built but not broadcast. Set PRIVATE_KEY in .env to enable real writes.")
        return 0
    if res.status != 1:
        print(f"\n✗ feedback tx mined but reverted (status={res.status})")
        return 1
    print(f"\n✓ feedback written. tx: https://sepolia.basescan.org/tx/{res.tx_hash}")
    return 0


def cmd_loop(args) -> int:
    n2 = topology(args.b_port)
    n3 = topology(args.c_port)
    extras = [
        {"agent_id": args.target_agent_id, "name": "worker-b", "wallet": args.payee_wallet,
         "axl_pubkey": n2["our_public_key"],
         "endpoints": [{"name": "axl", "endpoint": n2["our_public_key"]}]},
        {"agent_id": args.target_agent_id, "name": "worker-c", "wallet": args.payee_wallet,
         "axl_pubkey": n3["our_public_key"],
         "endpoints": [{"name": "axl", "endpoint": n3["our_public_key"]}]},
    ]
    out = complete_hire_loop(
        capability="phase5-demo",
        service=args.service,
        inner_request={"params": {"input": args.input}},
        candidates=[], extra_candidates=extras,
        a2a_timeout=args.timeout,
        api_port=args.a_port,
        payment_amount_usdc=args.amount,
        feedback_score=args.score,
        feedback_tags=["trustgate", "phase5-demo"],
        write_feedback_onchain=args.target_agent_id >= 0,
        force_stub_settlement=not args.keeper_live,
        verbose=True,
    )
    print(json.dumps(out.to_dict(), indent=2, default=str))
    print(f"\noverall_status: {out.overall_status}")
    return 0 if out.overall_status == "ok" else 1


def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status")

    s = sub.add_parser("settle")
    s.add_argument("wallet")
    s.add_argument("--amount", type=float, default=0.1)
    s.add_argument("--key", help="idempotency key (auto if omitted)")
    s.add_argument("--force-stub", action="store_true")

    s = sub.add_parser("feedback")
    s.add_argument("agent_id", type=int)
    s.add_argument("--score", type=float, default=0.95)
    s.add_argument("--tag", action="append", help="repeatable; max 2 used")
    s.add_argument("--endpoint", default="")
    s.add_argument("--feedback-uri", default="")

    s = sub.add_parser("loop")
    s.add_argument("--service", default="uppercase_text")
    s.add_argument("--input", default="phase 5 ok")
    s.add_argument("--amount", type=float, default=0.1)
    s.add_argument("--score", type=float, default=0.95)
    s.add_argument("--timeout", type=float, default=10.0)
    s.add_argument("--a-port", type=int, default=9002)
    s.add_argument("--b-port", type=int, default=9012)
    s.add_argument("--c-port", type=int, default=9022)
    s.add_argument("--keeper-live", action="store_true",
                   help="use real KeeperHub if KEEPERHUB_API_KEY is set; otherwise stays in stub mode regardless")
    s.add_argument("--target-agent-id", type=int, default=-1,
                   help="if ≥0, write feedback to this real on-chain agent id after the synthetic delivery")
    s.add_argument("--payee-wallet", default="0x0000000000000000000000000000000000000000",
                   help="wallet to pay (used for the settlement step)")

    args = p.parse_args()
    return {
        "status": cmd_status,
        "settle": cmd_settle,
        "feedback": cmd_feedback,
        "loop": cmd_loop,
    }[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
