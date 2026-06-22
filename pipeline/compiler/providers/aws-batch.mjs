import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function aws(args, options = {}) {
  const result = spawnSync('aws', args, { encoding: 'utf8', ...options })
  if (result.status !== 0) throw new Error(result.stderr || `AWS command failed: aws ${args.join(' ')}`)
  return result.stdout.trim()
}

export async function submitAwsBatchJob({ job, jobPath, plan }) {
  const region = required('AWS_REGION')
  const bucket = required('SCENE_COMPILER_S3_BUCKET')
  const queue = required('SCENE_COMPILER_BATCH_QUEUE')
  const definition = required('SCENE_COMPILER_JOB_DEFINITION')
  const prefix = `scene-compiler/jobs/${job.id}`
  const jobKey = `${prefix}/${basename(jobPath)}`
  const sourceKey = `${prefix}/source.mp4`

  aws(['s3', 'cp', jobPath, `s3://${bucket}/${jobKey}`, '--region', region])
  aws(['s3', 'cp', plan.artifacts.sourceVideo, `s3://${bucket}/${sourceKey}`, '--region', region])

  const containerOverrides = JSON.stringify({
    environment: [
      { name: 'SCENE_COMPILER_BUCKET', value: bucket },
      { name: 'SCENE_COMPILER_JOB_KEY', value: jobKey },
      { name: 'SCENE_COMPILER_SOURCE_KEY', value: sourceKey },
      { name: 'SCENE_COMPILER_OUTPUT_PREFIX', value: `${prefix}/output` },
    ],
    resourceRequirements: [{ type: 'GPU', value: String(job.models.editor.gpuCount ?? 1) }],
  })

  const response = aws([
    'batch',
    'submit-job',
    '--region',
    region,
    '--job-name',
    job.id,
    '--job-queue',
    queue,
    '--job-definition',
    definition,
    '--container-overrides',
    containerOverrides,
    '--output',
    'json',
  ])

  return {
    provider: 'aws-batch',
    job: JSON.parse(response),
    artifactPrefix: `s3://${bucket}/${prefix}`,
  }
}

export function describeAwsBatchJob(jobId) {
  const region = required('AWS_REGION')
  const response = aws([
    'batch',
    'describe-jobs',
    '--region',
    region,
    '--jobs',
    jobId,
    '--output',
    'json',
  ])
  return JSON.parse(response).jobs?.[0] ?? null
}
