"""ERC-8004 Identity Registry client.

Reads the live IdentityRegistry on Base (or Base Sepolia by default), enumerates
registered agents via `Registered` events, resolves their off-chain agent cards,
and supports filtering by advertised capability.

Phase 2 scope:
  * query_agents(capability=None)       -> list of agent dicts (cached)
  * fetch_agent_card(agent_id_or_uri)   -> parsed card JSON
  * get_agent_wallet(agent_id)          -> Address
  * get_token_uri(agent_id)             -> string

Phase 3 will add reputation reads on top of this client.

Implementation notes:
  * Scanning 4M+ blocks every run is too slow on a public RPC. We persist
    `Registered` events to {TRUSTGATE_CACHE_DIR}/agents-{chain_id}-{addr}.json
    and only scan the delta on subsequent runs.
  * agentURI may be empty, `data:application/json;base64,...`, `ipfs://...`,
    or `https?://...`. The resolver handles all four; per-card failures are
    logged and the agent is returned with `card_load_error` set so callers can
    decide whether to drop it.
  * 60s in-memory result cache on query_agents() avoids re-walking the cache
    file on hot loops.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional
from urllib.parse import urlparse, unquote

import requests
from web3 import Web3
from web3.exceptions import Web3RPCError

from config import (
    BASE_RPC_URL,
    IDENTITY_REGISTRY_ADDRESS,
    IPFS_GATEWAYS,
    TRUSTGATE_CACHE_DIR,
)

ABI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "abis")


def _load_abi(name: str) -> list[dict]:
    with open(os.path.join(ABI_DIR, f"{name}.json")) as f:
        return json.load(f)


@dataclass
class Agent:
    agent_id: int
    owner: str
    agent_uri: str
    block: int
    tx_hash: str
    card: Optional[dict] = None
    card_load_error: Optional[str] = None
    capabilities: list[str] = field(default_factory=list)
    endpoints: list[dict] = field(default_factory=list)
    name: Optional[str] = None
    active: Optional[bool] = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


CARD_TIMEOUT = 8.0
DATA_URI_RE = re.compile(r"^data:application/json(?:;[^,]*)?,(.*)$", re.DOTALL)


def _decode_data_uri(uri: str) -> dict:
    m = DATA_URI_RE.match(uri)
    if not m:
        raise ValueError(f"not a data:application/json URI: {uri[:60]}")
    payload = m.group(1)
    is_b64 = ";base64" in uri.split(",", 1)[0]
    raw = base64.b64decode(payload) if is_b64 else unquote(payload).encode()
    return json.loads(raw.decode("utf-8"))


def _fetch_ipfs(cid_path: str, gateways: Iterable[str], timeout: float = CARD_TIMEOUT) -> bytes:
    last_err: Optional[Exception] = None
    for gw in gateways:
        try:
            r = requests.get(gw + cid_path, timeout=timeout)
            r.raise_for_status()
            return r.content
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"all IPFS gateways failed for {cid_path}: {last_err}")


def resolve_agent_card(uri: str, ipfs_gateways: Iterable[str] = IPFS_GATEWAYS, timeout: float = CARD_TIMEOUT) -> dict:
    """Resolve an agentURI to its parsed JSON agent card."""
    if not uri:
        raise ValueError("empty agent URI")
    if uri.startswith("data:"):
        return _decode_data_uri(uri)
    if uri.startswith("ipfs://"):
        return json.loads(_fetch_ipfs(uri[len("ipfs://"):], ipfs_gateways, timeout).decode("utf-8"))
    parsed = urlparse(uri)
    if parsed.scheme in ("http", "https"):
        r = requests.get(uri, timeout=timeout)
        r.raise_for_status()
        return r.json()
    raise ValueError(f"unsupported agentURI scheme: {uri[:80]}")


def extract_capabilities(card: dict) -> list[str]:
    """Flatten an agent card's advertised skills/capabilities/domains into one list.

    Different agents on Base Sepolia put capability strings under different keys
    (`skills`, `capabilities`, `domains`) on each endpoint. Treat them all as
    capability tags for matching purposes — Phase 3 ranking will weight reputation
    separately, so over-matching here is cheap.
    """
    caps: set[str] = set()
    for ep in card.get("endpoints") or []:
        for k in ("skills", "capabilities", "domains"):
            for v in ep.get(k, []) or []:
                if isinstance(v, str) and v:
                    caps.add(v.strip().lower())
    for k in ("skills", "capabilities", "domains"):
        for v in card.get(k, []) or []:
            if isinstance(v, str) and v:
                caps.add(v.strip().lower())
    return sorted(caps)


# ----- on-chain client -----------------------------------------------------


class RegistryClient:
    def __init__(
        self,
        rpc_url: str = BASE_RPC_URL,
        identity_address: str = IDENTITY_REGISTRY_ADDRESS,
        cache_dir: str = TRUSTGATE_CACHE_DIR,
        scan_chunk: int = 5000,
        ipfs_gateways: Iterable[str] = IPFS_GATEWAYS,
    ):
        self.rpc_url = rpc_url
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
        self.identity_address = Web3.to_checksum_address(identity_address)
        self.identity_abi = _load_abi("IdentityRegistry")
        self.identity = self.w3.eth.contract(address=self.identity_address, abi=self.identity_abi)
        self.chain_id = self.w3.eth.chain_id
        self.cache_dir = cache_dir
        self.scan_chunk = scan_chunk
        self.ipfs_gateways = list(ipfs_gateways)
        os.makedirs(self.cache_dir, exist_ok=True)
        self._results_cache: dict[tuple, tuple[float, list[Agent]]] = {}
        self._card_cache_path = os.path.join(
            self.cache_dir, f"cards-{self.chain_id}-{self.identity_address.lower()}.json"
        )
        self._card_cache: dict[str, dict] = {}
        if os.path.exists(self._card_cache_path):
            try:
                with open(self._card_cache_path) as f:
                    self._card_cache = json.load(f)
            except Exception:
                self._card_cache = {}

    def _save_card_cache(self) -> None:
        tmp = self._card_cache_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self._card_cache, f)
        os.replace(tmp, self._card_cache_path)

    def _resolve_card_cached(self, agent_id: int, uri: str, *, timeout: float = CARD_TIMEOUT) -> dict:
        """Resolve a card, memoising both successes and failures to avoid re-fetching IPFS."""
        key = str(agent_id)
        cached = self._card_cache.get(key)
        if cached and cached.get("uri") == uri and "card" in cached:
            return cached["card"]
        if cached and cached.get("uri") == uri and "error" in cached:
            raise RuntimeError(cached["error"])
        try:
            card = resolve_agent_card(uri, self.ipfs_gateways, timeout=timeout)
        except Exception as e:
            self._card_cache[key] = {"uri": uri, "error": f"{type(e).__name__}: {e}"}
            raise
        self._card_cache[key] = {"uri": uri, "card": card}
        return card

    # ----- low-level identity reads ---------------------------------------

    def get_token_uri(self, agent_id: int) -> str:
        return self.identity.functions.tokenURI(agent_id).call()

    def get_agent_wallet(self, agent_id: int) -> str:
        return self.identity.functions.getAgentWallet(agent_id).call()

    def owner_of(self, agent_id: int) -> str:
        return self.identity.functions.ownerOf(agent_id).call()

    # ----- deploy-block discovery -----------------------------------------

    def find_deploy_block(self) -> int:
        hi = self.w3.eth.block_number
        lo = 0
        while lo < hi:
            mid = (lo + hi) // 2
            code = self.w3.eth.get_code(self.identity_address, block_identifier=mid)
            if code and code != b"":
                hi = mid
            else:
                lo = mid + 1
        return lo

    # ----- event-cache enumeration ----------------------------------------

    @property
    def cache_path(self) -> str:
        return os.path.join(
            self.cache_dir, f"agents-{self.chain_id}-{self.identity_address.lower()}.json"
        )

    def _load_cache(self) -> dict:
        if os.path.exists(self.cache_path):
            with open(self.cache_path) as f:
                return json.load(f)
        return {"last_scanned_block": None, "deploy_block": None, "agents": {}}

    def _save_cache(self, data: dict) -> None:
        tmp = self.cache_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f, indent=2, sort_keys=True)
        os.replace(tmp, self.cache_path)

    def scan_registered_events(self, *, max_block: Optional[int] = None, verbose: bool = False) -> dict:
        """Walk Registered events, persist incrementally, return the cache dict."""
        cache = self._load_cache()
        if cache["deploy_block"] is None:
            if verbose:
                print("[registry] discovering deploy block ...")
            cache["deploy_block"] = self.find_deploy_block()
            if verbose:
                print(f"[registry] deploy_block = {cache['deploy_block']}")

        head = max_block if max_block is not None else self.w3.eth.block_number
        start = (cache["last_scanned_block"] + 1) if cache["last_scanned_block"] is not None else cache["deploy_block"]
        if start > head:
            if verbose:
                print(f"[registry] cache already at head (block {start - 1})")
            return cache

        chunk = self.scan_chunk
        b = start
        ev = self.identity.events.Registered
        n_new = 0
        while b <= head:
            end = min(b + chunk - 1, head)
            try:
                logs = ev.get_logs(from_block=b, to_block=end)
            except (Web3RPCError, ValueError) as e:
                msg = str(e)[:120]
                if verbose:
                    print(f"[registry]   chunk_err {b}-{end}: {type(e).__name__} {msg}; halving chunk")
                if chunk <= 200:
                    raise
                chunk = max(200, chunk // 2)
                continue
            for l in logs:
                a_id = int(l.args.agentId)
                cache["agents"][str(a_id)] = {
                    "agent_id": a_id,
                    "agent_uri": l.args.agentURI,
                    "owner": l.args.owner,
                    "block": int(l.blockNumber),
                    "tx_hash": l.transactionHash.hex(),
                }
                n_new += 1
            cache["last_scanned_block"] = end
            self._save_cache(cache)
            if verbose:
                pct = 100.0 * (end - start + 1) / max(1, head - start + 1)
                print(
                    f"[registry]   scanned {b}-{end} ({pct:5.1f}%, "
                    f"+{len(logs)} agents, total={len(cache['agents'])})"
                )
            b = end + 1
        if verbose:
            print(f"[registry] scan complete: +{n_new} new agents, total {len(cache['agents'])}")
        return cache

    # ----- high-level query -----------------------------------------------

    def list_agents(self, *, refresh: bool = False, max_block: Optional[int] = None, verbose: bool = False) -> list[dict]:
        if refresh or not os.path.exists(self.cache_path):
            cache = self.scan_registered_events(max_block=max_block, verbose=verbose)
        else:
            cache = self._load_cache()
            if cache["last_scanned_block"] is None:
                cache = self.scan_registered_events(max_block=max_block, verbose=verbose)
        return sorted(cache["agents"].values(), key=lambda a: a["agent_id"])

    def query_agents(
        self,
        capability: Optional[str] = None,
        *,
        limit: Optional[int] = None,
        require_card: bool = True,
        only_active: bool = True,
        refresh: bool = False,
        max_block: Optional[int] = None,
        card_timeout: float = CARD_TIMEOUT,
        verbose: bool = False,
    ) -> list[Agent]:
        """Top-level: list agents, hydrate cards, optionally filter by capability."""
        cache_key = (capability, limit, require_card, only_active, max_block)
        now = time.monotonic()
        cached = self._results_cache.get(cache_key)
        if cached and not refresh and (now - cached[0]) < 60:
            return cached[1]

        rows = self.list_agents(refresh=refresh, max_block=max_block, verbose=verbose)
        out: list[Agent] = []
        cap_lower = capability.lower() if capability else None
        n_processed = 0
        for r in rows:
            n_processed += 1
            if verbose and n_processed % 200 == 0:
                print(f"[registry]   hydrated {n_processed}/{len(rows)} cards (matches so far: {len(out)})")
            ag = Agent(
                agent_id=r["agent_id"],
                owner=r["owner"],
                agent_uri=r["agent_uri"],
                block=r["block"],
                tx_hash=r["tx_hash"],
            )
            if not ag.agent_uri:
                if require_card:
                    continue
                out.append(ag)
                if limit is not None and len(out) >= limit:
                    break
                continue
            try:
                card = self._resolve_card_cached(ag.agent_id, ag.agent_uri, timeout=card_timeout)
                ag.card = card
                ag.name = card.get("name")
                ag.active = card.get("active")
                ag.endpoints = card.get("endpoints") or []
                ag.capabilities = extract_capabilities(card)
            except Exception as e:
                ag.card_load_error = f"{type(e).__name__}: {e}"
                if require_card:
                    continue

            if only_active and ag.active is False:
                continue
            if cap_lower and cap_lower not in ag.capabilities:
                continue
            out.append(ag)
            if limit is not None and len(out) >= limit:
                break

        # one disk write per query, regardless of how many cards were resolved
        self._save_card_cache()
        self._results_cache[cache_key] = (now, out)
        return out


# ----- backwards-compatible function shims (used by main.py) ---------------

_default_client: Optional[RegistryClient] = None


def _client() -> RegistryClient:
    global _default_client
    if _default_client is None:
        _default_client = RegistryClient()
    return _default_client


def query_agents(capability: str, **kw) -> list[dict]:
    """Compat shim: returns dicts shaped for main.py / scorer.

    Phase 4 will fold AXL pubkeys into agent cards (an extension under
    endpoints[name="axl"]); for now we surface whatever endpoint we find.
    """
    agents = _client().query_agents(capability=capability, **kw)
    out = []
    for a in agents:
        axl_pubkey = ""
        for ep in a.endpoints:
            if (ep.get("name") or "").lower() == "axl" and ep.get("endpoint"):
                axl_pubkey = ep["endpoint"]
                break
        out.append({
            "agent_id": a.agent_id,
            "name": a.name,
            "owner": a.owner,
            "axl_pubkey": axl_pubkey,
            "wallet": a.owner,  # placeholder until Phase 3 wires getAgentWallet
            "capabilities": a.capabilities,
            "endpoints": a.endpoints,
        })
    return out


def get_reputation(agent_id: int) -> dict:
    """Stub kept for main.py — Phase 3 implements the real read."""
    return {"score": 0.0, "count": 0}
