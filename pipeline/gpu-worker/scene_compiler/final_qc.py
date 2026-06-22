from __future__ import annotations

import json
import hashlib
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .utils import write_json


def _rate(value: str) -> float:
    numerator, denominator = value.split("/", 1)
    denominator_value = float(denominator)
    return float(numerator) / denominator_value if denominator_value else 0


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_final_qc(job: dict, output: Path, report_path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)],
        capture_output=True,
        check=True,
        text=True,
    )
    probe = json.loads(result.stdout)
    video_streams = [stream for stream in probe["streams"] if stream["codec_type"] == "video"]
    audio_streams = [stream for stream in probe["streams"] if stream["codec_type"] == "audio"]
    video_stream = video_streams[0] if video_streams else {}
    duration = float(probe["format"]["duration"])
    capture = cv2.VideoCapture(str(output))
    frame_count = 0
    black_frames = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frame_count += 1
        black_frames += int(float(np.mean(frame)) < 2)
    capture.release()
    black_ratio = black_frames / frame_count if frame_count else 1
    report = {
        "duration": duration,
        "frameCount": frame_count,
        "blackFrameRatio": black_ratio,
        "hasVideo": bool(video_streams),
        "hasAudio": bool(audio_streams),
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": _rate(video_stream.get("r_frame_rate", "0/1")),
        "fileSize": output.stat().st_size,
        "sha256": _sha256(output),
        "humanReviewRequired": bool(job["quality"]["requireHumanReview"]),
    }
    expected_frames = round(duration * job["video"]["fps"])
    report["passed"] = (
        report["hasVideo"]
        and (report["hasAudio"] or not job["quality"]["requireAudio"])
        and duration >= job["quality"]["minimumDurationSeconds"]
        and black_ratio <= job["quality"]["maximumBlackFrameRatio"]
        and report["width"] == job["video"]["width"]
        and report["height"] == job["video"]["height"]
        and abs(report["fps"] - job["video"]["fps"]) <= 0.05
        and abs(frame_count - expected_frames) <= 2
        and report["fileSize"] >= 250_000
    )
    write_json(report_path, report)
    if not report["passed"]:
        raise RuntimeError(f"Final quality gate failed: {report}")
    return report
