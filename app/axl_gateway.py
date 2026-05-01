"""HTTP bridge to a local AXL node.

The AXL node exposes a localhost HTTP API (default 127.0.0.1:9002). This module
wraps the three endpoints we need for Phase 1:

  - GET  /topology  -> our pubkey, ipv6, peers
  - POST /send      -> fire-and-forget bytes to a peer (via X-Destination-Peer-Id)
  - GET  /recv      -> drain one inbound message (X-From-Peer-Id header)

Higher-level helpers serialise/deserialise JSON job specs so callers can pass
plain dicts.
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

import requests

from config import AXL_NODE_PORT


def _api_base(port: int | None = None, host: str = "127.0.0.1") -> str:
    return f"http://{host}:{port or AXL_NODE_PORT}"


def topology(api_port: int | None = None) -> dict:
    r = requests.get(f"{_api_base(api_port)}/topology", timeout=5)
    r.raise_for_status()
    return r.json()


def our_pubkey(api_port: int | None = None) -> str:
    return topology(api_port)["our_public_key"]


def send_bytes(peer_pubkey: str, body: bytes, api_port: int | None = None) -> int:
    r = requests.post(
        f"{_api_base(api_port)}/send",
        headers={"X-Destination-Peer-Id": peer_pubkey},
        data=body,
        timeout=10,
    )
    r.raise_for_status()
    return int(r.headers.get("X-Sent-Bytes", len(body)))


def recv_once(api_port: int | None = None) -> Optional[tuple[str, bytes]]:
    r = requests.get(f"{_api_base(api_port)}/recv", timeout=5)
    if r.status_code == 204:
        return None
    r.raise_for_status()
    return r.headers.get("X-From-Peer-Id", ""), r.content


def recv_blocking(
    api_port: int | None = None,
    timeout: float = 30.0,
    poll_interval: float = 0.25,
) -> tuple[str, bytes]:
    """Poll /recv until a message arrives or `timeout` elapses."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        msg = recv_once(api_port)
        if msg is not None:
            return msg
        time.sleep(poll_interval)
    raise TimeoutError(f"no AXL message received within {timeout}s on port {api_port or AXL_NODE_PORT}")


def send_job(peer_pubkey: str, job_spec: dict[str, Any], api_port: int | None = None) -> int:
    """Phase 1 helper: ship a JSON-encoded job spec to a peer."""
    return send_bytes(peer_pubkey, json.dumps(job_spec).encode("utf-8"), api_port)


def recv_job(api_port: int | None = None, timeout: float = 30.0) -> tuple[str, dict[str, Any]]:
    sender, body = recv_blocking(api_port, timeout=timeout)
    return sender, json.loads(body.decode("utf-8"))


def send_task(agent_axl_pubkey: str, task_spec: dict, api_port: int | None = None) -> int:
    """Backwards-compatible alias used by main.py — Phase 4 will replace this with A2A."""
    return send_job(agent_axl_pubkey, task_spec, api_port)


def receive_job(api_port: int | None = None, timeout: float = 30.0) -> tuple[str, dict[str, Any]]:
    """Backwards-compatible alias used by main.py."""
    return recv_job(api_port, timeout)
