# Offline Branch Renderer

The browser chooses an outcome. This pipeline creates the outcome video before the game is deployed.

## Double Shot

```bash
npm run render:double-shot
```

Inputs:

- `public/footage/messi-breakaway.mp4`
- `pipeline/assets/match-ball.png`
- `pipeline/scenes/breakaway-finish/double-shot.json`

Output:

- `public/footage/branches/breakaway-finish/double-shot-v1.mp4`

The scene manifest contains frame-checked screen-space trajectory points. The renderer bakes the second ball, scale change, spin, motion trail, and original broadcast audio into an H.264/AAC MP4.

The web player maps the generated file to the `double-finish` outcome and disables its old browser ball overlay while the rendered branch is playing.

## Quality Gate

- The outcome must be understandable with all captions hidden.
- The original and alternate balls must separate visibly after contact.
- The alternate ball must track the camera pan and reach a different part of the goal.
- No DOM/CSS ball may appear during a rendered branch.
- The result UI must remain hidden through the decisive action.
- The branch must retain the original 1280x720, 30 fps broadcast timing and audio.

## Next Upgrade

The deterministic ball compositor is the first completed stage. The GPU compiler adds:

- SAM 2.1 multi-object masks for ball, goalkeeper, and shooter.
- VACE masked video editing with three candidates per edit.
- Automated mask, outside-mask, black-frame, duration, and audio gates.
- Feathered color-matched compositing.
- Deterministic rendering of both tracked and alternate ball paths.
- Human approval before publishing generated reactions.

Validate the production job without a GPU:

```bash
npm run compiler:test
npm run compiler:dry-run
```

Run the local API:

```bash
npm run compiler:api
```

Production execution uses the container in `pipeline/gpu-worker` and the AWS Batch template in `pipeline/infra/aws-batch-gpu.yaml`. The production profile requests eight GPUs for VACE 14B at 720p. Deploying that infrastructure incurs substantial cloud cost and must be explicitly approved before provisioning.

The API exposes the complete review lifecycle:

- `POST /jobs`
- `GET /jobs/:id`
- `GET /jobs/:id/artifact`
- `GET /jobs/:id/report`
- `POST /jobs/:id/approve`

See `pipeline/infra/README.md` for image publishing, infrastructure deployment, IAM scope, and cost prerequisites.
