from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .utils import write_json


def mask_quality(job: dict, masks_root: Path, report_path: Path) -> dict:
    results = {}
    required_frames = job["video"]["endFrame"] - job["video"]["contactFrame"] + 1
    for tracked in job["objects"]:
        files = sorted((masks_root / tracked["name"]).glob("*.png"))
        nonempty = 0
        ious = []
        previous = None
        for path in files:
            mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE) > 127
            nonempty += int(mask.any())
            if previous is not None:
                union = np.logical_or(previous, mask).sum()
                intersection = np.logical_and(previous, mask).sum()
                ious.append(float(intersection / union) if union else 1.0)
            previous = mask
        coverage = nonempty / required_frames
        flicker = 1 - (float(np.mean(ious)) if ious else 0)
        results[tracked["name"]] = {
            "coverage": coverage,
            "flicker": flicker,
            "passed": coverage >= tracked.get("requiredCoverage", job["quality"]["minimumMaskCoverage"])
            and flicker <= job["quality"]["maximumMaskFlicker"],
        }
    report = {"objects": results, "passed": all(value["passed"] for value in results.values())}
    write_json(report_path, report)
    if not report["passed"]:
        raise RuntimeError(f"Mask quality gate failed: {report}")
    return report


def _video_frames(path: Path) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    return frames


def rank_candidates(
    job: dict,
    source_clip: Path,
    mask_videos: dict[str, Path],
    candidates: dict[str, list[Path]],
    report_path: Path,
) -> dict[str, Path]:
    source_frames = _video_frames(source_clip)
    selections = {}
    report = {}

    for edit in job["edits"]:
        mask_frames = _video_frames(mask_videos[edit["id"]])
        candidate_scores = []
        for candidate in candidates[edit["id"]]:
            generated_frames = _video_frames(candidate)
            frame_count = min(len(source_frames), len(mask_frames), len(generated_frames))
            outside_diffs = []
            black_ratios = []
            for index in range(frame_count):
                source = source_frames[index].astype(np.float32) / 255
                generated = generated_frames[index].astype(np.float32) / 255
                mask = mask_frames[index][:, :, 0] > 127
                outside = ~mask
                outside_diffs.append(float(np.abs(source[outside] - generated[outside]).mean()) if outside.any() else 0)
                black_ratios.append(float((generated.mean(axis=2) < 0.01).mean()))
            outside_diff = float(np.mean(outside_diffs)) if outside_diffs else 1
            black_ratio = float(np.mean(black_ratios)) if black_ratios else 1
            score = outside_diff + black_ratio * 4
            candidate_scores.append({
                "path": str(candidate),
                "outsideMaskDifference": outside_diff,
                "blackFrameRatio": black_ratio,
                "score": score,
                "passed": outside_diff <= job["quality"]["maximumOutsideMaskDifference"]
                and black_ratio <= job["quality"]["maximumBlackFrameRatio"],
            })
        candidate_scores.sort(key=lambda value: value["score"])
        passing = [value for value in candidate_scores if value["passed"]]
        if not passing:
            raise RuntimeError(f"No VACE candidate passed for {edit['id']}: {candidate_scores}")
        selected = Path(passing[0]["path"])
        selections[edit["id"]] = selected
        report[edit["id"]] = {"selected": str(selected), "candidates": candidate_scores}

    write_json(report_path, report)
    return selections
