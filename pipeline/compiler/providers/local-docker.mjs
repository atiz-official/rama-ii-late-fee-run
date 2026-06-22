import { spawnSync } from 'node:child_process'

export function runLocalDockerJob({ jobPath, projectRoot }) {
  const image = process.env.SCENE_COMPILER_IMAGE ?? 'aiartgames/scene-compiler:local'
  const args = [
    'run',
    '--rm',
    '--gpus',
    'all',
    '-v',
    `${projectRoot}:/workspace`,
    '-v',
    `${process.env.SCENE_COMPILER_MODEL_DIR ?? 'scene-compiler-models'}:/models`,
    image,
    '--job',
    `/workspace/${jobPath.slice(projectRoot.length + 1).replaceAll('\\', '/')}`,
  ]

  console.log(`docker ${args.join(' ')}`)
  return spawnSync('docker', args, { stdio: 'inherit' })
}
