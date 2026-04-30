"""AXL gateway: receives jobs from Agent A and routes tasks to Agent B."""
import requests
from config import AXL_NODE_PORT


def receive_job():
    """Listen on the local AXL HTTP bridge for an incoming job spec."""
    raise NotImplementedError


def send_task(agent_axl_pubkey: str, task_spec: dict, timeout: int = 60) -> dict:
    """Forward a task to Agent B's AXL node and return the result."""
    url = f"http://localhost:{AXL_NODE_PORT}/send"
    payload = {"to": agent_axl_pubkey, "body": task_spec}
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()
