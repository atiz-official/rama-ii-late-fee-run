import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJobPlan } from './job-plan.mjs'
import { validateCompilerJob } from './job-schema.mjs'

const compilerDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(compilerDir, '../..')
const args = new Set(process.argv.slice(2))
const positional = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const jobPath = resolve(projectRoot, positional[0] ?? 'pipeline/jobs/breakaway-double-shot-gpu.json')
const dryRun = args.has('--dry-run')
const job = validateCompilerJob(JSON.parse(readFileSync(jobPath, 'utf8')))
const plan = createJobPlan(job, projectRoot)

if (!existsSync(plan.artifacts.sourceVideo)) throw new Error(`Source video not found: ${plan.artifacts.sourceVideo}`)
if (!existsSync(plan.artifacts.manifest)) throw new Error(`Deterministic manifest not found: ${plan.artifacts.manifest}`)

if (dryRun) {
  console.log(JSON.stringify({ mode: 'dry-run', job, plan }, null, 2))
  process.exit(0)
}

const provider = process.env.SCENE_COMPILER_PROVIDER ?? 'local-docker'
if (provider === 'aws-batch') {
  const { submitAwsBatchJob } = await import('./providers/aws-batch.mjs')
  const submission = await submitAwsBatchJob({ job, jobPath, plan, projectRoot })
  console.log(JSON.stringify(submission, null, 2))
  process.exit(0)
}

if (provider === 'local-docker') {
  const { runLocalDockerJob } = await import('./providers/local-docker.mjs')
  const result = runLocalDockerJob({ jobPath, plan, projectRoot })
  process.exit(result.status ?? 1)
}

throw new Error(`Unknown SCENE_COMPILER_PROVIDER: ${provider}`)
