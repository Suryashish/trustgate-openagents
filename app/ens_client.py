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

ENS_RPC_URL = os.getenv(
    "ENS_RPC_URL",
    # public Ethereum mainnet endpoints — first reachable wins
    "https://eth.llamarpc.com",
)
ENS_CACHE_TTL = float(os.getenv("ENS_CACHE_TTL", "600"))  # 10 minutes


class ENSResolver:
    def __init__(self, rpc_url: str = ENS_RPC_URL, cache_ttl: float = ENS_CACHE_TTL):
        self.rpc_url = rpc_url
        self.cache_ttl = cache_ttl
        self._lock = threading.Lock()
        self._w3: Optional[Web3] = None
        self._init_error: Optional[str] = None
        self._reverse: dict[str, tuple[float, Optional[str]]] = {}
        self._forward: dict[str, tuple[float, Optional[str]]] = {}

    def _client(self) -> Optional[Web3]:
        with self._lock:
            if self._w3 is not None:
                return self._w3
            if self._init_error is not None:
                return None
            try:
                w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 6}))
                # Touch chain_id to surface RPC errors early; ENS module is lazy.
                _ = w3.eth.chain_id
                self._w3 = w3
                return w3
            except Exception as e:
                self._init_error = f"{type(e).__name__}: {e}"
                return None

    def status(self) -> dict:
        w3 = self._client()
        if w3 is None:
            return {"ok": False, "rpc_url": self.rpc_url, "error": self._init_error}
        try:
            return {
                "ok": True,
                "rpc_url": self.rpc_url,
                "chain_id": int(w3.eth.chain_id),
                "head_block": int(w3.eth.block_number),
                "cache_ttl_s": self.cache_ttl,
            }
        except Exception as e:
            return {"ok": False, "rpc_url": self.rpc_url, "error": f"{type(e).__name__}: {e}"}

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
        w3 = self._client()
        if w3 is None:
            return None
        try:
            name = w3.ens.name(address)  # type: ignore[union-attr]
        except Exception:
            name = None
        # Verify forward resolution matches (canonical ENS pattern). web3.py's
        # `name()` already does this, but only when both addr and name resolve.
        self._reverse[address] = (now, name or None)
        return name or None

    # ----- forward: name -> address ----------------------------------------

    def address_for(self, name: str) -> Optional[str]:
        if not name or "." not in name:
            return None
        now = time.monotonic()
        cached = self._forward.get(name)
        if cached and (now - cached[0]) < self.cache_ttl:
            return cached[1]
        w3 = self._client()
        if w3 is None:
            return None
        try:
            addr = w3.ens.address(name)  # type: ignore[union-attr]
        except Exception:
            addr = None
        addr_str = Web3.to_checksum_address(addr) if addr else None
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
