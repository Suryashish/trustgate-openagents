"""ENS resolver — Phase 6.

ENS lives on Ethereum mainnet only, so we keep a *separate* web3 client
pointed at an Ethereum RPC and re-use web3.py's built-in `Web3.ens` module.

Used by:
  * /api/self/status         — the human-readable name for the TrustGate signer
  * /api/agents/<id> render  — show owners by ENS when one is set
  * /api/ens/resolve         — direct UI / CLI lookup

All lookups are best-effort and TTL-cached: the dashboard must keep working
when the ENS RPC is rate-limited or unreachable, so every method swallows
errors and returns `None`.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Optional

from web3 import Web3

# Comma-separated list — first reachable wins. Public mainnet RPCs are
# rate-limited and individual ones flap, so we always try a few.
ENS_RPC_URL = os.getenv(
    "ENS_RPC_URL",
    "https://eth.llamarpc.com,https://ethereum-rpc.publicnode.com,https://cloudflare-eth.com,https://1rpc.io/eth",
)
ENS_CACHE_TTL = float(os.getenv("ENS_CACHE_TTL", "600"))  # 10 minutes


def _split_rpcs(spec: str) -> list[str]:
    return [u.strip() for u in spec.split(",") if u.strip()]


class ENSResolver:
    """Best-effort ENS resolver with per-call RPC failover.

    web3.py's ENS module performs ~3 RPCs per `name()` call (resolver lookup
    + forward + reverse). If the first RPC throws partway through, we retry
    the whole lookup against the next RPC in the list. Init never fails — a
    completely-unreachable ENS just returns None for every query.
    """

    def __init__(self, rpc_url: str = ENS_RPC_URL, cache_ttl: float = ENS_CACHE_TTL):
        self.rpc_urls = _split_rpcs(rpc_url) or ["https://eth.llamarpc.com"]
        self.cache_ttl = cache_ttl
        self._lock = threading.Lock()
        self._clients: dict[str, Web3] = {}
        self._init_errors: dict[str, str] = {}
        self._reverse: dict[str, tuple[float, Optional[str]]] = {}
        self._forward: dict[str, tuple[float, Optional[str]]] = {}

    @property
    def rpc_url(self) -> str:
        # Backwards-compat alias used by the API status payload + dashboard.
        return ",".join(self.rpc_urls)

    def _build(self, url: str) -> Optional[Web3]:
        with self._lock:
            if url in self._clients:
                return self._clients[url]
            if url in self._init_errors:
                return None
            try:
                w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 6}))
                _ = w3.eth.chain_id  # surface DNS / TLS errors early
                self._clients[url] = w3
                return w3
            except Exception as e:
                self._init_errors[url] = f"{type(e).__name__}: {e}"
                return None

    def _try(self, do):
        """Walk RPCs until one succeeds. Returns (result, used_url) or (None, None)."""
        last_err: Optional[str] = None
        for url in self.rpc_urls:
            w3 = self._build(url)
            if w3 is None:
                last_err = self._init_errors.get(url)
                continue
            try:
                return do(w3), url
            except Exception as e:
                last_err = f"{type(e).__name__}: {e}"
                continue
        return None, last_err

    def status(self) -> dict:
        # Probe each URL once so the dashboard can show which are reachable.
        per_rpc = []
        for url in self.rpc_urls:
            w3 = self._build(url)
            if w3 is None:
                per_rpc.append({"url": url, "ok": False, "error": self._init_errors.get(url)})
                continue
            try:
                per_rpc.append({"url": url, "ok": True, "chain_id": int(w3.eth.chain_id), "head_block": int(w3.eth.block_number)})
            except Exception as e:
                per_rpc.append({"url": url, "ok": False, "error": f"{type(e).__name__}: {e}"})
        any_up = any(e["ok"] for e in per_rpc)
        return {"ok": any_up, "rpc_url": self.rpc_url, "rpcs": per_rpc, "cache_ttl_s": self.cache_ttl}

    # ----- reverse: address -> ENS name ------------------------------------

    def name_for(self, address: str) -> Optional[str]:
        if not address:
            return None
        try:
            address = Web3.to_checksum_address(address)
        except Exception:
            return None
        now = time.monotonic()
        cached = self._reverse.get(address)
        if cached and (now - cached[0]) < self.cache_ttl:
            return cached[1]
        result, _used = self._try(lambda w3: w3.ens.name(address))  # type: ignore[union-attr]
        name = result if isinstance(result, str) and result else None
        self._reverse[address] = (now, name)
        return name

    # ----- forward: name -> address ----------------------------------------

    def address_for(self, name: str) -> Optional[str]:
        if not name or "." not in name:
            return None
        now = time.monotonic()
        cached = self._forward.get(name)
        if cached and (now - cached[0]) < self.cache_ttl:
            return cached[1]
        result, _used = self._try(lambda w3: w3.ens.address(name))  # type: ignore[union-attr]
        addr_str = Web3.to_checksum_address(result) if result else None
        self._forward[name] = (now, addr_str)
        return addr_str


_default: Optional[ENSResolver] = None
_default_lock = threading.Lock()


def default_resolver() -> ENSResolver:
    global _default
    with _default_lock:
        if _default is None:
            _default = ENSResolver()
        return _default
