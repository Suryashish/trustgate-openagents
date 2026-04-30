"""Reads ERC-8004 Identity and Reputation registries on Base."""
from web3 import Web3
from config import (
    BASE_RPC_URL,
    IDENTITY_REGISTRY_ADDRESS,
    REPUTATION_REGISTRY_ADDRESS,
)

w3 = Web3(Web3.HTTPProvider(BASE_RPC_URL)) if BASE_RPC_URL else None


def query_agents(capability: str) -> list[dict]:
    """Return registered agents that advertise the given capability."""
    raise NotImplementedError


def get_reputation(agent_id: int) -> dict:
    """Return {score, feedback_count} for the agent from the Reputation Registry."""
    raise NotImplementedError
