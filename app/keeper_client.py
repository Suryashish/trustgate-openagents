"""KeeperHub MCP wrapper for payment settlement and reputation write-back."""
import requests
from config import KEEPERHUB_API_KEY

KEEPERHUB_MCP_URL = "http://localhost:8787"


def settle_payment(agent_wallet: str, amount_usdc: float) -> dict:
    """Trigger a KeeperHub workflow that pays the agent and returns the receipt."""
    raise NotImplementedError


def write_feedback(agent_id: int, score: float, tags: list[str]) -> dict:
    """Post a feedback record to the ERC-8004 Reputation Registry."""
    raise NotImplementedError
