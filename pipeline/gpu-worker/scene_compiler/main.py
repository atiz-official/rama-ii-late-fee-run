from __future__ import annotations

import argparse
import json
import os
import shutil
import traceback
from pathlib import Path

import boto3

from .compositor import composite_balls, composite_human_edits, make_final_video
from .final_qc import run_final_qc
from .masks import create_edit_masks
from .media import encode_frames, extract_frames, extract_segment, mux_original_audio, probe
from .models import ensure_models
from .quality import mask_quality, rank_candidates
from .sam2_tracker import track_objects
from .utils import read_json, run, update_status, write_json
from .vace_editor import generate_candidates


def _download_s3_job(workspace: Path) -> Path:
    bucket = os.environ["SCENE_COMPILER_BUCKET"]
    job_key = os.environ["SCENE_COMPILER_JOB_KEY"]
    source_key = os.environ["SCENE_COMPILER_SOURCE_KEY"]
    s3 = boto3.client("s3")
    job_path = workspace / "job.json"
    source_path = workspace / "source.mp4"
    s3.download_file(bucket, job_key, str(job_path))
    s3.download_file(bucket, source_key, str(source_path))
    job = read_json(job_path)
    job["sourceVideo"] = str(source_path)
    write_json(job_path, job)
    return job_path


def _upload_results(workspace: Path, output: Path) -> None:
    bucket = os.environ.get("SCENE_COMPILER_BUCKET")
    prefix = os.environ.get("SCENE_COMPILER_OUTPUT_PREFIX")
    if not bucket or not prefix:
        return
    s3 = boto3.client("s3")
    for path in workspace.rglob("*"):
        if path.is_file():
            key = f"{prefix}/{path.relative_to(workspace).as_posix()}"
            s3.upload_file(str(path), bucket, key)
    if output.exists():
        s3.upload_file(str(output), bucket, f"{prefix}/final.mp4")


def compile_job(job_path: Path) -> dict:
    job = read_json(job_path)
    project_root = Path("/workspace") if Path("/workspace").exists() else job_path.parents[2]
    source = Path(job["sourceVideo"])
    if not source.is_absolute():
        source = project_root / source
    output = Path(job["outputVideo"])
    if not output.is_absolute():
        output = project_root / output
    workspace = Path(job["workspace"])
    if not workspace.is_absolute():
        workspace = project_root / workspace

    frames = workspace / "frames"
    masks = workspace / "masks"
    mask_videos_root = workspace / "mask-videos"
    candidates = workspace / "candidates"
    selected = workspace / "selected"
    composite = workspace / "composite"
    reports = workspace / "reports"
    status = workspace / "status.json"
    for directory in [workspace, frames, masks, mask_videos_root, candidates, selected, composite, reports]:
        directory.mkdir(parents=True, exist_ok=True)

    update_status(status, "probe", "running")
    ensure_models(job)
    probe(source, reports / "source-probe.json")
    update_status(status, "extract", "running")
    extract_frames(source, frames, job["video"]["fps"])

    source_segment_frames = workspace / "source-segment-frames"
    source_segment_frames.mkdir(parents=True, exist_ok=True)
    start = job["video"]["contactFrame"]
    end = job["video"]["endFrame"]
    for segment_index, frame_index in enumerate(range(start, end + 1), start=1):
        shutil.copy2(frames / f"{frame_index + 1:05d}.jpg", source_segment_frames / f"{segment_index:05d}.jpg")
    source_segment = workspace / "source-segment.mp4"
    extract_segment(source, source_segment, start, end, job["video"]["fps"])

    update_status(status, "track", "running")
    track_report = reports / "tracks.json"
    track_objects(job, source_segment_frames, masks, track_report)
    update_status(status, "mask-qc", "running")
    mask_quality(job, masks, reports / "mask-qc.json")
    update_status(status, "mask-video", "running")
    mask_videos = create_edit_masks(job, masks, mask_videos_root, job["video"]["fps"])

    update_status(status, "generate", "running")
    candidate_paths = generate_candidates(job, source_segment, mask_videos, candidates)
    update_status(status, "candidate-qc", "running")
    selections = rank_candidates(job, source_segment, mask_videos, candidate_paths, reports / "candidate-qc.json")
    for edit_id, candidate in selections.items():
        selected_path = selected / f"{edit_id}.mp4"
        shutil.copy2(candidate, selected_path)
        selections[edit_id] = selected_path

    update_status(status, "composite-humans", "running")
    human_frames = composite / "human-frames"
    composite_human_edits(job, frames, mask_videos, selections, human_frames)
    human_silent = composite / "human-edits-silent.mp4"
    human_video = composite / "human-edits.mp4"
    encode_frames(human_frames, human_silent, job["video"]["fps"])
    mux_original_audio(human_silent, source, human_video)

    update_status(status, "composite-balls", "running")
    ball_frames = composite / "ball-frames"
    deterministic_manifest = project_root / job["deterministicComposite"]["manifest"]
    ball_asset = project_root / "pipeline/assets/match-ball.png"
    composite_balls(job, deterministic_manifest, track_report, masks, human_frames, ball_asset, ball_frames)
    make_final_video(job, ball_frames, source, composite / "final-silent.mp4", output)

    update_status(status, "final-qc", "running")
    report = run_final_qc(job, output, reports / "final-qc.json")
    update_status(status, "review", "awaiting-human-review", {"output": str(output), "report": report})
    _upload_results(workspace, output)
    return {"output": str(output), "workspace": str(workspace), "report": report}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", type=Path)
    parser.add_argument("--workspace", type=Path, default=Path("/workspace/job"))
    args = parser.parse_args()
    job_path = args.job
    if job_path is None and os.environ.get("SCENE_COMPILER_JOB_KEY"):
        args.workspace.mkdir(parents=True, exist_ok=True)
        job_path = _download_s3_job(args.workspace)
    if job_path is None:
        raise SystemExit("--job or SCENE_COMPILER_JOB_KEY is required")
    try:
        result = compile_job(job_path)
        print(json.dumps(result, indent=2))
    except Exception as error:
        job = read_json(job_path)
        project_root = Path("/workspace") if Path("/workspace").exists() else job_path.parents[2]
        workspace = Path(job["workspace"])
        if not workspace.is_absolute():
            workspace = project_root / workspace
        workspace.mkdir(parents=True, exist_ok=True)
        update_status(
            workspace / "status.json",
            "failed",
            "failed",
            {"error": str(error), "traceback": traceback.format_exc()},
        )
        _upload_results(workspace, workspace / "missing-final.mp4")
        raise


if __name__ == "__main__":
    main()
