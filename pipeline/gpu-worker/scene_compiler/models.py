from __future__ import annotations

import os
from pathlib import Path

from huggingface_hub import snapshot_download


def ensure_models(job: dict) -> None:
    editor = job["models"]["editor"]
    checkpoint = Path(editor["checkpointDir"])
    if checkpoint.exists() and any(checkpoint.iterdir()):
        return
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    repo_id = "Wan-AI/Wan2.1-VACE-14B" if editor["model"] == "Wan2.1-VACE-14B" else "Wan-AI/Wan2.1-VACE-1.3B"
    print(f"Downloading {repo_id} to {checkpoint}", flush=True)
    snapshot_download(
        repo_id=repo_id,
        local_dir=checkpoint,
        token=os.environ.get("HF_TOKEN") or None,
        local_dir_use_symlinks=False,
    )
