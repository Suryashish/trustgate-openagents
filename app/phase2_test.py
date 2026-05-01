"""Phase 2 smoke test / CLI for the ERC-8004 Identity Registry client.

Usage:
  python phase2_test.py                       # list 5 agents from Base Sepolia
  python phase2_test.py --capability swap     # filter by advertised capability
  python phase2_test.py --refresh             # force a fresh on-chain scan
  python phase2_test.py --inspect 17          # full dump of one agent's card
  python phase2_test.py --max-block 36400000  # bound the scan (faster first run)

Defaults to Base Sepolia (chain 84532) — see config.py / NETWORK env var.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from textwrap import shorten

from registry_client import RegistryClient, resolve_agent_card


def _print_agent(a, idx: int, verbose: bool) -> None:
    name = a.name or "(no name)"
    desc = (a.card or {}).get("description", "") if a.card else ""
    print(f"  [{idx}] #{a.agent_id}  {name}")
    print(f"        owner: {a.owner}")
    print(f"        active: {a.active}   capabilities ({len(a.capabilities)}): "
          f"{', '.join(a.capabilities[:8]) + (' ...' if len(a.capabilities) > 8 else '')}")
    if a.endpoints:
        ep0 = a.endpoints[0]
        print(f"        endpoint[0]: name={ep0.get('name')!r} -> {ep0.get('endpoint')!r}")
    if desc:
        print(f"        desc: {shorten(desc, width=110, placeholder=' ...')}")
    if verbose and a.card:
        print(f"        card: {json.dumps(a.card)[:300]}")
    if a.card_load_error:
        print(f"        card_load_error: {a.card_load_error}")


def main() -> int:
    p = argparse.ArgumentParser(description="Phase 2 — ERC-8004 Identity Registry smoke test")
    p.add_argument("--capability", help="filter by capability (case-insensitive)")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--refresh", action="store_true", help="force on-chain scan even if cache exists")
    p.add_argument("--max-block", type=int, default=None, help="cap scan at this block (faster first run)")
    p.add_argument("--inspect", type=int, default=None, help="dump full card for a specific agent_id")
    p.add_argument("--include-inactive", action="store_true")
    p.add_argument("--include-broken-cards", action="store_true")
    p.add_argument("--card-timeout", type=float, default=3.0,
                   help="seconds to wait per card fetch (data: URIs are instant; only IPFS/HTTPS hits this)")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    client = RegistryClient()
    print(f"[phase2] RPC: {client.rpc_url}")
    print(f"[phase2] chain_id={client.chain_id}  identity={client.identity_address}")
    print(f"[phase2] head_block={client.w3.eth.block_number}")
    print(f"[phase2] cache: {client.cache_path}")

    if args.inspect is not None:
        uri = client.get_token_uri(args.inspect)
        print(f"agent #{args.inspect} tokenURI: {uri[:120]}{'...' if len(uri) > 120 else ''}")
        try:
            card = resolve_agent_card(uri, client.ipfs_gateways)
        except Exception as e:
            print(f"FAIL: {type(e).__name__}: {e}")
            return 1
        print(json.dumps(card, indent=2))
        return 0

    t0 = time.time()
    agents = client.query_agents(
        capability=args.capability,
        limit=args.limit,
        require_card=not args.include_broken_cards,
        only_active=not args.include_inactive,
        refresh=args.refresh,
        max_block=args.max_block,
        card_timeout=args.card_timeout,
        verbose=args.verbose,
    )
    dt = time.time() - t0

    cap_msg = f" with capability {args.capability!r}" if args.capability else ""
    print(f"[phase2] found {len(agents)} agent(s){cap_msg} in {dt:.1f}s\n")
    for i, a in enumerate(agents):
        _print_agent(a, i, args.verbose)
        print()

    if not agents:
        print("(no matches — try --capability with a different term, or --include-inactive)")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
