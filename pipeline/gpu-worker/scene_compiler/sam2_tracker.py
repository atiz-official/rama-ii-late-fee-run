from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import torch
from sam2.sam2_video_predictor import SAM2VideoPredictor

from .utils import write_json


def _expanded(mask: np.ndarray, pixels: int) -> np.ndarray:
    if pixels <= 0:
        return mask
    kernel_size = pixels * 2 + 1
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.dilate(mask.astype(np.uint8), kernel, iterations=1).astype(bool)


def track_objects(job: dict, frames_dir: Path, masks_root: Path, report_path: Path) -> dict:
    model_name = job["models"]["tracker"]["model"]
    predictor = SAM2VideoPredictor.from_pretrained(model_name)
    state = predictor.init_state(video_path=str(frames_dir))
    contact = job["video"]["contactFrame"]

    for tracked in job["objects"]:
        frame_index = tracked["promptFrame"] - contact
        box = np.asarray(tracked["box"], dtype=np.float32)
        predictor.add_new_points_or_box(
            inference_state=state,
            frame_idx=frame_index,
            obj_id=tracked["id"],
            box=box,
        )

    metadata = {tracked["id"]: tracked for tracked in job["objects"]}
    mask_stats: dict[str, list[dict]] = {tracked["name"]: [] for tracked in job["objects"]}

    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
        for frame_index, object_ids, mask_logits in predictor.propagate_in_video(state):
            absolute_frame = contact + int(frame_index)
            for position, object_id in enumerate(object_ids):
                tracked = metadata[int(object_id)]
                mask = (mask_logits[position] > 0).cpu().numpy().squeeze()
                mask = _expanded(mask, int(tracked.get("maskExpand", 0)))
                output_dir = masks_root / tracked["name"]
                output_dir.mkdir(parents=True, exist_ok=True)
                output_path = output_dir / f"{absolute_frame + 1:05d}.png"
                cv2.imwrite(str(output_path), mask.astype(np.uint8) * 255)
                area = int(mask.sum())
                ys, xs = np.where(mask)
                centroid = [float(xs.mean()), float(ys.mean())] if area else None
                mask_stats[tracked["name"]].append({
                    "frame": absolute_frame,
                    "area": area,
                    "centroid": centroid,
                })

    report = {"model": model_name, "objects": mask_stats}
    write_json(report_path, report)
    return report
