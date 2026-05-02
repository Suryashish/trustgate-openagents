"""Example TrustGate worker — Phase 10.

Demonstrates the worker SDK in ~30 lines. Provides three handlers:

    summarise — collapses long input into a one-line summary stat
    reverse   — reverses input text
    echo      — returns input unchanged (sanity check)

Run via:
    PYTHONPATH=app .venv/bin/python -m worker_sdk run \\
        --handler example_worker:summarise \\
        --port 9014 --name example-summariser \\
        --capabilities summarise_documents

Register on chain (dry-run by default; live with PRIVATE_KEY in .env):
    PYTHONPATH=app .venv/bin/python -m worker_sdk register \\
        --capability summarise_documents \\
        --name example-summariser \\
        --description "demo summariser shipped with TrustGate Phase 10" \\
        --axl-api-port 9012
"""
from __future__ import annotations

from typing import Any


def summarise(params: dict[str, Any], *, service: str, **_ctx) -> dict[str, Any]:
    text = str(params.get("input", ""))
    words = len(text.split())
    return {
        "result": f"summary of {len(text)}-char / {words}-word input",
        "preview": (text[:80] + "…") if len(text) > 80 else text,
        "service": service,
    }


def reverse(params: dict[str, Any], *, service: str, **_ctx) -> dict[str, Any]:
    text = str(params.get("input", ""))
    return {"result": text[::-1], "service": service}


def echo(params: dict[str, Any], *, service: str, **_ctx) -> dict[str, Any]:
    return {"result": params.get("input", ""), "service": service, "echo": True}
