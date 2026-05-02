"""TrustGate self-registration — Phase 6.

Builds the agent card that TrustGate publishes about itself when registering
on the ERC-8004 IdentityRegistry. Card schema follows the conventions used
by the other Base Sepolia agents (skills/endpoints arrays + `name`/`active`),
which `extract_capabilities()` in registry_client knows how to read.

Flow:
  build_self_card()       -> dict     (the JSON the contract should serve)
  encode_self_card_uri()  -> str      ("data:application/json;base64,...")

Both are pure functions — no chain calls — so the dashboard can render the
exact card the user is about to register before they spend any gas.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Optional

from config import AXL_NODE_PORT


def build_self_card(
    *,
    name: str = "TrustGate",
    description: Optional[str] = None,
    ens_name: Optional[str] = None,
    axl_pubkey: Optional[str] = None,
    api_url: Optional[str] = None,
    repo_url: str = "https://github.com/erc-8004/erc-8004-contracts",
    version: str = "0.6.0",
    extra_skills: Optional[list[str]] = None,
) -> dict:
    """Construct the canonical TrustGate agent card.

    `axl_pubkey` is what other orchestrators will pin their AXL traffic to;
    leaving it None at registration time is fine — the owner can call
    `setAgentURI` later once the production AXL node has stable keys.
    """
    description = description or (
        "Autonomous hiring manager for AI agents on Ethereum. Reads the live "
        "ERC-8004 Identity + Reputation registries, ranks candidates with a "
        "60/20/20 weighted score, and routes the job over the Gensyn AXL P2P "
        "mesh. Settles via KeeperHub and writes feedback back onchain."
    )
    skills = sorted({
        "agent_hiring",
        "agent_discovery",
        "reputation_aggregation",
        "axl_routing",
        *(extra_skills or []),
    })

    endpoints: list[dict] = []
    if axl_pubkey:
        endpoints.append({
            "name": "axl",
            "endpoint": axl_pubkey,
            "skills": skills,
        })
    if api_url:
        endpoints.append({
            "name": "http",
            "endpoint": api_url,
            "skills": skills,
        })

    card: dict = {
        "name": name,
        "description": description,
        "active": True,
        "skills": skills,
        "endpoints": endpoints,
        "version": version,
        "links": {
            "repo": repo_url,
            "blueprint": "TrustGate_Blueprint.md",
        },
    }
    if ens_name:
        card["ens"] = ens_name
    return card


def encode_self_card_uri(card: dict) -> str:
    """Return a `data:application/json;base64,...` URI for the given card."""
    raw = json.dumps(card, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:application/json;base64,{b64}"


def default_self_uri(
    *,
    ens_name: Optional[str] = None,
    axl_pubkey: Optional[str] = None,
    api_url: Optional[str] = None,
) -> tuple[dict, str]:
    """Convenience: build the card + its data URI in one call."""
    api_url = api_url or os.getenv("TRUSTGATE_PUBLIC_URL", f"http://127.0.0.1:{os.getenv('PORT', '8000')}")
    card = build_self_card(
        ens_name=ens_name,
        axl_pubkey=axl_pubkey,
        api_url=api_url,
    )
    return card, encode_self_card_uri(card)
