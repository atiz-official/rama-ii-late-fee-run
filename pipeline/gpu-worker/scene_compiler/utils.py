from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


def run(command: list[str], cwd: Path | None = None) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"$ {printable}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def update_status(path: Path, stage: str, state: str, details: dict[str, Any] | None = None) -> None:
    current = read_json(path) if path.exists() else {"stages": []}
    current["currentStage"] = stage
    current["state"] = state
    current["stages"].append({"stage": stage, "state": state, "details": details or {}})
    write_json(path, current)
