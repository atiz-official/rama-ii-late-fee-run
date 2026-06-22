from __future__ import annotations

import os
from pathlib import Path

from .utils import run


def generate_candidates(job: dict, source_clip: Path, mask_videos: dict[str, Path], candidates_root: Path) -> dict[str, list[Path]]:
    editor = job["models"]["editor"]
    vace_root = Path(os.environ.get("VACE_ROOT", "/opt/VACE"))
    outputs: dict[str, list[Path]] = {}
    frame_count = job["video"]["endFrame"] - job["video"]["contactFrame"] + 1
    frame_count = max(5, frame_count - ((frame_count - 1) % 4))

    for edit in job["edits"]:
        edit_outputs = []
        for seed in editor["seeds"]:
            output = candidates_root / edit["id"] / f"seed-{seed}.mp4"
            raw_output = candidates_root / edit["id"] / f"seed-{seed}-raw.mp4"
            output.parent.mkdir(parents=True, exist_ok=True)
            gpu_count = int(editor.get("gpuCount", 1))
            launcher = (
                ["torchrun", "--nproc_per_node", str(gpu_count)]
                if gpu_count > 1
                else ["python3.10"]
            )
            distributed = (
                ["--dit_fsdp", "--t5_fsdp", "--ulysses_size", str(gpu_count), "--ring_size", "1"]
                if gpu_count > 1
                else []
            )
            run(launcher + [
                str(vace_root / "vace/vace_wan_inference.py"),
                "--model_name",
                "vace-14B",
                "--size",
                editor.get("size", "720p"),
                "--frame_num",
                str(frame_count),
                "--ckpt_dir",
                editor["checkpointDir"],
                "--src_video",
                str(source_clip),
                "--src_mask",
                str(mask_videos[edit["id"]]),
                "--prompt",
                edit["prompt"],
                "--use_prompt_extend",
                "plain",
                "--base_seed",
                str(seed),
                "--sample_steps",
                str(editor.get("sampleSteps", 40)),
                "--sample_guide_scale",
                str(editor.get("guideScale", 5)),
                "--save_file",
                str(raw_output),
                "--offload_model",
                "true",
            ] + distributed, cwd=vace_root)
            duration = (job["video"]["endFrame"] - job["video"]["contactFrame"] + 1) / job["video"]["fps"]
            run([
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(raw_output),
                "-vf",
                f"fps={job['video']['fps']},scale={job['video']['width']}:{job['video']['height']}:flags=lanczos",
                "-t",
                f"{duration:.6f}",
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "12",
                "-pix_fmt",
                "yuv420p",
                str(output),
            ])
            edit_outputs.append(output)
        outputs[edit["id"]] = edit_outputs
    return outputs
