"""Runtime config — env-driven, with sensible Base Sepolia testnet defaults.

Switch to mainnet by setting NETWORK=base-mainnet in .env (or by overriding
the individual *_ADDRESS / *_RPC_URL vars).
"""
import os

from dotenv import load_dotenv

load_dotenv()

NETWORK = os.getenv("NETWORK", "base-sepolia").lower()

# Default RPCs and registry deployments per network.
# Sources:
#   github.com/erc-8004/erc-8004-contracts (README — Base Sepolia + mainnet)
#   TrustGate_Blueprint.md s. 3.3 (mainnet)
_NETWORKS = {
    "base-sepolia": {
        "rpc_url": "https://sepolia.base.org",
        "chain_id": 84532,
        "identity_registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
        "reputation_registry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    },
    "base-mainnet": {
        "rpc_url": "https://mainnet.base.org",
        "chain_id": 8453,
        "identity_registry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        "reputation_registry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    },
}

if NETWORK not in _NETWORKS:
    raise ValueError(f"Unknown NETWORK={NETWORK!r}; expected one of {list(_NETWORKS)}")

_DEFAULTS = _NETWORKS[NETWORK]

BASE_RPC_URL = os.getenv("BASE_RPC_URL", _DEFAULTS["rpc_url"])
CHAIN_ID = int(os.getenv("CHAIN_ID", _DEFAULTS["chain_id"]))
IDENTITY_REGISTRY_ADDRESS = os.getenv("IDENTITY_REGISTRY_ADDRESS", _DEFAULTS["identity_registry"])
REPUTATION_REGISTRY_ADDRESS = os.getenv("REPUTATION_REGISTRY_ADDRESS", _DEFAULTS["reputation_registry"])

PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
KEEPERHUB_API_KEY = os.getenv("KEEPERHUB_API_KEY", "")
AXL_NODE_PORT = int(os.getenv("AXL_NODE_PORT", "9002"))

IPFS_GATEWAYS = [
    g.strip() for g in os.getenv(
        "IPFS_GATEWAYS",
        "https://ipfs.io/ipfs/,https://cloudflare-ipfs.com/ipfs/,https://gateway.pinata.cloud/ipfs/",
    ).split(",")
    if g.strip()
]

# Default cache dir (overridable). Used by registry_client to persist scanned events.
TRUSTGATE_CACHE_DIR = os.getenv(
    "TRUSTGATE_CACHE_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache"),
)
