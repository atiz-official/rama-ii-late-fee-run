from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .media import encode_mask_video


def create_edit_masks(job: dict, masks_root: Path, mask_videos_root: Path, fps: int) -> dict[str, Path]:
    start = job["video"]["contactFrame"]
    end = job["video"]["endFrame"]
    width = job["video"]["width"]
    height = job["video"]["height"]
    outputs: dict[str, Path] = {}

    for edit in job["edits"]:
        output_dir = mask_videos_root / edit["id"]
        output_dir.mkdir(parents=True, exist_ok=True)
        for frame in range(start, end + 1):
            combined = np.zeros((height, width), dtype=np.uint8)
            for object_name in edit["objects"]:
                mask_path = masks_root / object_name / f"{frame + 1:05d}.png"
                if not mask_path.exists():
                    continue
                mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
                combined = np.maximum(combined, mask)
            cv2.imwrite(str(output_dir / f"{frame - start + 1:05d}.png"), combined)

        output_video = mask_videos_root / f"{edit['id']}.mp4"
        encode_mask_video(output_dir, output_video, fps)
        outputs[edit["id"]] = output_video

    return outputs
