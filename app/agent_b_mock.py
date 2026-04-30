"""Minimal Agent B simulator: receives a task over AXL and returns a mock result."""


def handle_task(task_spec: dict) -> dict:
    return {
        "status": "ok",
        "result": f"processed:{task_spec.get('task')}",
    }


if __name__ == "__main__":
    raise NotImplementedError("Wire this to the AXL HTTP bridge once available.")
