"""Phase 6 driver: TrustGate self-registration + ENS resolution.

Subcommands:

    python phase6_test.py status
        Show signing key state, balance, signer's ENS name (mainnet),
        and any agent ids the signer already owns on the configured network.

    python phase6_test.py card [--axl-pubkey ABC] [--api-url URL] [--ens NAME]
        Print the JSON agent card we'd register, plus the data: URI form
        (this is what gets stored on chain). No network calls.

    python phase6_test.py register [--axl-pubkey ABC] [--api-url URL] [--ens NAME]
        Build (and sign, if PRIVATE_KEY is set) a `register(string)` tx
        against IdentityRegistry. Dry-run by default — prints calldata.

    python phase6_test.py ens <address>
        Reverse-resolve an Ethereum address to its ENS primary name.

    python phase6_test.py whoami
        Convenience: status + ENS for signer + owned agent ids in one call.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from ens_client import default_resolver
from registry_client import RegistryClient
from self_registration import build_self_card, encode_self_card_uri


def _signer_address() -> str | None:
    pk = os.getenv("PRIVATE_KEY", "")
    if not pk:
        return None
    try:
        from eth_account import Account
        return Account.from_key(pk).address
    except Exception as e:
        print(f"[!] could not derive signer: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def cmd_status(args) -> int:
    rc = RegistryClient()
    print(f"NETWORK={os.getenv('NETWORK', 'base-sepolia')}  chain_id={rc.chain_id}  head={rc.w3.eth.block_number}")
    print(f"identity_registry={rc.identity_address}")
    addr = _signer_address()
    if not addr:
        print("PRIVATE_KEY: ✗ unset (registration will be dry-run only)")
    else:
        bal = rc.w3.eth.get_balance(addr)
        print(f"PRIVATE_KEY: ✓ signer={addr}  balance={rc.w3.from_wei(bal, 'ether')} ETH")
        owned = rc.find_owned_agent_ids(addr)
        print(f"owned agent ids on cache: {owned or '(none — run phase2_test.py --refresh first)'}")
    ens = default_resolver()
    s = ens.status()
    print(f"ENS RPC: {s.get('rpc_url')}  {'✓' if s.get('ok') else '✗ ' + str(s.get('error'))}")
    if addr and s.get("ok"):
        name = ens.name_for(addr)
        print(f"ENS reverse: {addr} -> {name or '(no primary name set)'}")
    return 0


def cmd_card(args) -> int:
    addr = _signer_address()
    ens_name = args.ens
    if not ens_name and addr:
        ens_name = default_resolver().name_for(addr)
    card = build_self_card(
        ens_name=ens_name,
        axl_pubkey=args.axl_pubkey,
        api_url=args.api_url,
    )
    uri = encode_self_card_uri(card)
    print("=== TrustGate agent card ===")
    print(json.dumps(card, indent=2, sort_keys=True))
    print()
    print(f"agent_uri ({len(uri)} bytes):")
    print(uri)
    return 0


def cmd_register(args) -> int:
    rc = RegistryClient()
    addr = _signer_address()
    ens_name = args.ens
    if not ens_name and addr:
        ens_name = default_resolver().name_for(addr)
    card = build_self_card(
        ens_name=ens_name,
        axl_pubkey=args.axl_pubkey,
        api_url=args.api_url,
    )
    uri = encode_self_card_uri(card)
    print(f"agent_uri ({len(uri)} bytes) — first 120: {uri[:120]}...")
    print(f"chain_id={rc.chain_id}  identity_registry={rc.identity_address}")

    res = rc.send_register(uri, wait_for_receipt=not args.no_wait)
    print()
    print(json.dumps(res, indent=2, sort_keys=True, default=str))
    if res.get("mode") == "live" and res.get("agent_id") is not None:
        print()
        print(f"✓ TrustGate registered as agent #{res['agent_id']}")
        print(f"  basescan tx: https://sepolia.basescan.org/tx/{res['tx_hash']}")
    elif res.get("mode") == "dry_run":
        print()
        print("ℹ dry-run only. Set PRIVATE_KEY in .env (next to app/) to broadcast.")
        print("  Faucet: https://www.alchemy.com/faucets/base-sepolia")
    return 0 if res.get("mode") != "live" or res.get("status", 1) == 1 else 1


def cmd_ens(args) -> int:
    res = default_resolver()
    name = res.name_for(args.address)
    print(f"{args.address} -> {name or '(no ENS primary name)'}")
    if name:
        forward = res.address_for(name)
        print(f"forward {name} -> {forward}")
    return 0


def cmd_whoami(args) -> int:
    addr = _signer_address()
    if not addr:
        print("PRIVATE_KEY unset; nothing to look up.")
        return 1
    rc = RegistryClient()
    ens = default_resolver().name_for(addr)
    bal = rc.w3.eth.get_balance(addr)
    owned = rc.find_owned_agent_ids(addr)
    print(json.dumps({
        "address": addr,
        "ens": ens,
        "balance_eth": float(rc.w3.from_wei(bal, "ether")),
        "chain_id": rc.chain_id,
        "owned_agent_ids": owned,
    }, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TrustGate Phase 6 — self-registration + ENS")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status", help="signer + ENS + cached ownership")

    p_card = sub.add_parser("card", help="print the agent card we'd register")
    p_card.add_argument("--axl-pubkey", help="endpoints[name=axl].endpoint")
    p_card.add_argument("--api-url", help="endpoints[name=http].endpoint")
    p_card.add_argument("--ens", help="ENS name to pin in the card (overrides reverse-resolution)")

    p_reg = sub.add_parser("register", help="build/sign register(string) tx")
    p_reg.add_argument("--axl-pubkey", help="endpoints[name=axl].endpoint")
    p_reg.add_argument("--api-url", help="endpoints[name=http].endpoint")
    p_reg.add_argument("--ens", help="ENS name to pin in the card")
    p_reg.add_argument("--no-wait", action="store_true", help="don't block on receipt")

    p_ens = sub.add_parser("ens", help="reverse-resolve an address to ENS")
    p_ens.add_argument("address")

    sub.add_parser("whoami", help="signer + ENS + owned ids in one call")

    args = parser.parse_args(argv)
    return {
        "status": cmd_status,
        "card": cmd_card,
        "register": cmd_register,
        "ens": cmd_ens,
        "whoami": cmd_whoami,
    }[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
