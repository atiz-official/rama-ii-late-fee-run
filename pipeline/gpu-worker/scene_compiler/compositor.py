from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np

from .media import encode_frames, mux_original_audio


def _open_frames(path: Path) -> list[np.ndarray]:
    capture = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    return frames


def _match_color(generated: np.ndarray, original: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if mask.sum() < 16:
        return generated
    result = generated.astype(np.float32)
    source_pixels = result[mask]
    target_pixels = original.astype(np.float32)[mask]
    source_mean = source_pixels.mean(axis=0)
    target_mean = target_pixels.mean(axis=0)
    source_std = np.maximum(source_pixels.std(axis=0), 1)
    target_std = np.maximum(target_pixels.std(axis=0), 1)
    result = (result - source_mean) * (target_std / source_std) + target_mean
    return np.clip(result, 0, 255).astype(np.uint8)


def _add_contact_shadow(frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
    ys, xs = np.where(mask)
    if len(xs) < 32:
        return frame
    left, right = int(xs.min()), int(xs.max())
    bottom = int(ys.max())
    width = max(8, right - left)
    shadow = np.zeros(mask.shape, dtype=np.float32)
    cv2.ellipse(
        shadow,
        (int((left + right) / 2), min(frame.shape[0] - 1, bottom + max(2, width // 28))),
        (max(4, int(width * 0.42)), max(2, int(width * 0.08))),
        0,
        0,
        360,
        1,
        -1,
    )
    shadow = cv2.GaussianBlur(shadow, (0, 0), sigmaX=max(2, width * 0.06))
    shadow = np.clip(shadow[:, :, None] * 0.12, 0, 0.12)
    return np.clip(frame.astype(np.float32) * (1 - shadow), 0, 255).astype(np.uint8)


def composite_human_edits(
    job: dict,
    source_frames_dir: Path,
    mask_videos: dict[str, Path],
    selections: dict[str, Path],
    output_frames_dir: Path,
) -> None:
    output_frames_dir.mkdir(parents=True, exist_ok=True)
    source_paths = sorted(source_frames_dir.glob("*.jpg"))
    frames = [cv2.imread(str(path)) for path in source_paths]
    start = job["video"]["contactFrame"]

    for edit in job["edits"]:
        generated = _open_frames(selections[edit["id"]])
        masks = _open_frames(mask_videos[edit["id"]])
        count = min(len(generated), len(masks), job["video"]["endFrame"] - start + 1)
        for offset in range(count):
            frame_index = start + offset
            if frame_index >= len(frames):
                break
            original = frames[frame_index]
            candidate = cv2.resize(generated[offset], (original.shape[1], original.shape[0]), interpolation=cv2.INTER_LANCZOS4)
            mask = cv2.resize(masks[offset][:, :, 0], (original.shape[1], original.shape[0]), interpolation=cv2.INTER_LINEAR)
            mask_bool = mask > 127
            candidate = _match_color(candidate, original, mask_bool)
            if edit["type"] == "masked-video-edit" and job["deterministicComposite"].get("contactShadows", False):
                original = _add_contact_shadow(original, mask_bool)
            alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), sigmaX=3.2)
            alpha = np.clip(alpha[:, :, None], 0, 1)
            frames[frame_index] = (candidate * alpha + original * (1 - alpha)).astype(np.uint8)

    for index, frame in enumerate(frames, start=1):
        cv2.imwrite(str(output_frames_dir / f"{index:05d}.png"), frame)


def _interpolate(points: list[dict], time: float) -> tuple[float, float]:
    if time <= points[0]["time"]:
        return points[0]["x"], points[0]["y"]
    if time >= points[-1]["time"]:
        return points[-1]["x"], points[-1]["y"]
    for left, right in zip(points, points[1:]):
        if left["time"] <= time <= right["time"]:
            amount = (time - left["time"]) / (right["time"] - left["time"])
            return (
                left["x"] + (right["x"] - left["x"]) * amount,
                left["y"] + (right["y"] - left["y"]) * amount,
            )
    return points[-1]["x"], points[-1]["y"]


def _ball_sprite(ball_rgba: np.ndarray, size: int, angle: float) -> np.ndarray:
    resized = cv2.resize(ball_rgba, (size, size), interpolation=cv2.INTER_AREA if size < ball_rgba.shape[0] else cv2.INTER_LANCZOS4)
    center = (size / 2, size / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1)
    return cv2.warpAffine(resized, matrix, (size, size), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def _overlay_rgba(
    frame: np.ndarray,
    sprite: np.ndarray,
    x: float,
    y: float,
    opacity: float = 1,
    occlusion: np.ndarray | None = None,
    preserve_bright_lines: bool = False,
) -> None:
    height, width = sprite.shape[:2]
    left = int(round(x - width / 2))
    top = int(round(y - height / 2))
    right = left + width
    bottom = top + height
    clip_left = max(0, left)
    clip_top = max(0, top)
    clip_right = min(frame.shape[1], right)
    clip_bottom = min(frame.shape[0], bottom)
    if clip_left >= clip_right or clip_top >= clip_bottom:
        return
    sprite_crop = sprite[clip_top - top : clip_bottom - top, clip_left - left : clip_right - left]
    alpha = sprite_crop[:, :, 3:4].astype(np.float32) / 255 * opacity
    rgb = sprite_crop[:, :, :3]
    region = frame[clip_top:clip_bottom, clip_left:clip_right].copy()
    if occlusion is not None:
        occlusion_crop = occlusion[clip_top:clip_bottom, clip_left:clip_right]
        alpha *= 1 - np.clip(occlusion_crop[:, :, None].astype(np.float32) / 255, 0, 1)
    preserved = None
    if preserve_bright_lines:
        spread = region.max(axis=2) - region.min(axis=2)
        preserved = (region.mean(axis=2) > 168) & (spread < 58)
    frame[clip_top:clip_bottom, clip_left:clip_right] = (rgb * alpha + region * (1 - alpha)).astype(np.uint8)
    if preserved is not None:
        rendered = frame[clip_top:clip_bottom, clip_left:clip_right]
        rendered[preserved] = region[preserved]


def _ripple(frame: np.ndarray, x: float, y: float, radius: int, amount: float) -> np.ndarray:
    height, width = frame.shape[:2]
    map_x, map_y = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))
    dx = map_x - x
    dy = map_y - y
    distance = np.sqrt(dx * dx + dy * dy)
    influence = np.clip(1 - distance / radius, 0, 1)
    map_x += np.sin(distance * 0.42) * amount * influence
    map_y += np.cos(distance * 0.34) * amount * influence
    return cv2.remap(frame, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def composite_balls(
    job: dict,
    deterministic_manifest: Path,
    track_report: Path,
    masks_root: Path,
    input_frames_dir: Path,
    ball_asset: Path,
    output_frames_dir: Path,
) -> None:
    manifest = json.loads(deterministic_manifest.read_text(encoding="utf-8"))
    tracks = json.loads(track_report.read_text(encoding="utf-8"))["objects"]["ball"]
    tracked_centroids = {item["frame"]: item["centroid"] for item in tracks if item["centroid"]}
    ball = cv2.imread(str(ball_asset), cv2.IMREAD_UNCHANGED)
    output_frames_dir.mkdir(parents=True, exist_ok=True)
    fps = job["video"]["fps"]
    contact = job["video"]["contactFrame"]
    impact = job["deterministicComposite"]["netImpact"]
    occlusion_objects = job["deterministicComposite"].get("occlusionObjects", [])
    preserve_net_lines = job["deterministicComposite"].get("preserveNetLines", False)

    for frame_path in sorted(input_frames_dir.glob("*.png")):
        frame_number = int(frame_path.stem) - 1
        frame = cv2.imread(str(frame_path))
        time = frame_number / fps
        occlusion = np.zeros(frame.shape[:2], dtype=np.uint8)
        for object_name in occlusion_objects:
            mask_path = masks_root / object_name / f"{frame_number + 1:05d}.png"
            if mask_path.exists():
                mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
                occlusion = np.maximum(occlusion, mask)
        if contact <= frame_number <= job["video"]["endFrame"]:
            progress = min(1, max(0, (time - manifest["contactTime"]) / (manifest["impactTime"] - manifest["contactTime"])))
            size = int(round(manifest["ballSize"]["start"] + (manifest["ballSize"]["end"] - manifest["ballSize"]["start"]) * progress))
            sprite = _ball_sprite(ball, max(5, size), frame_number * 13)
            original_position = tracked_centroids.get(frame_number)
            if original_position:
                _overlay_rgba(
                    frame,
                    sprite,
                    original_position[0],
                    original_position[1],
                    occlusion=occlusion,
                    preserve_bright_lines=preserve_net_lines and progress > 0.68,
                )
            second_x, second_y = _interpolate(manifest["trajectory"], time)
            _overlay_rgba(
                frame,
                sprite,
                second_x,
                second_y,
                occlusion=occlusion,
                preserve_bright_lines=preserve_net_lines and progress > 0.68,
            )
            if frame_number - contact > 1:
                trail_x, trail_y = _interpolate(manifest["trajectory"], time - 0.04)
                _overlay_rgba(frame, sprite, trail_x, trail_y, opacity=0.12, occlusion=occlusion)

        impact_frame = round(impact["time"] * fps)
        if impact_frame <= frame_number <= impact_frame + 7:
            phase = (frame_number - impact_frame) / 7
            frame = _ripple(frame, impact["x"], impact["y"], impact["radius"], math.sin(phase * math.pi) * 3.2)
        cv2.imwrite(str(output_frames_dir / frame_path.name), frame)


def make_final_video(job: dict, frames_dir: Path, source_video: Path, silent_video: Path, output: Path) -> None:
    encode_frames(frames_dir, silent_video, job["video"]["fps"])
    mux_original_audio(silent_video, source_video, output)
