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

The deterministic ball compositor is the first completed stage. Keeper and player motion still come from the original footage. Replacing those reactions requires tracked masks, clean-plate inpainting, and generated reaction clips from a GPU worker.
