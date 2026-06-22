import { dirname, resolve } from 'node:path'

export function createJobPlan(job, projectRoot) {
  const workspace = resolve(projectRoot, job.workspace)
  const sourceVideo = resolve(projectRoot, job.sourceVideo)
  const outputVideo = resolve(projectRoot, job.outputVideo)
  const manifest = resolve(projectRoot, job.deterministicComposite.manifest)
  const artifacts = {
    workspace,
    sourceVideo,
    outputVideo,
    manifest,
    frames: resolve(workspace, 'frames'),
    masks: resolve(workspace, 'masks'),
    maskVideos: resolve(workspace, 'mask-videos'),
    candidates: resolve(workspace, 'candidates'),
    selected: resolve(workspace, 'selected'),
    composite: resolve(workspace, 'composite'),
    reports: resolve(workspace, 'reports'),
    status: resolve(workspace, 'status.json'),
  }

  return {
    jobId: job.id,
    artifacts,
    stages: [
      { id: 'probe', runner: 'ffprobe', outputs: [resolve(artifacts.reports, 'source-probe.json')] },
      { id: 'extract', runner: 'ffmpeg', outputs: [artifacts.frames] },
      { id: 'track', runner: 'sam2', outputs: job.objects.map((object) => resolve(artifacts.masks, object.name)) },
      { id: 'mask-qc', runner: 'python', outputs: [resolve(artifacts.reports, 'mask-qc.json')] },
      { id: 'mask-video', runner: 'ffmpeg', outputs: job.edits.map((edit) => resolve(artifacts.maskVideos, `${edit.id}.mp4`)) },
      {
        id: 'generate',
        runner: 'vace',
        outputs: job.edits.flatMap((edit) =>
          job.models.editor.seeds.map((seed) => resolve(artifacts.candidates, edit.id, `seed-${seed}.mp4`)),
        ),
      },
      { id: 'candidate-qc', runner: 'python', outputs: [resolve(artifacts.reports, 'candidate-qc.json')] },
      { id: 'select', runner: 'quality-gate', outputs: job.edits.map((edit) => resolve(artifacts.selected, `${edit.id}.mp4`)) },
      { id: 'composite-humans', runner: 'opencv', outputs: [resolve(artifacts.composite, 'human-edits.mp4')] },
      { id: 'composite-ball', runner: 'ffmpeg', outputs: [outputVideo] },
      { id: 'final-qc', runner: 'quality-gate', outputs: [resolve(artifacts.reports, 'final-qc.json')] },
      { id: 'publish', runner: 'artifact-store', outputs: [dirname(outputVideo)] },
    ],
  }
}
