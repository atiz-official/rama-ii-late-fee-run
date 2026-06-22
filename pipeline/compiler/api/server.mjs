import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCompilerJob } from '../job-schema.mjs'
import { JobStore } from './job-store.mjs'

const apiDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(apiDir, '../../..')
const store = new JobStore(process.env.SCENE_COMPILER_RUNTIME_DIR ?? resolve(projectRoot, 'pipeline/runtime/jobs'))
const port = Number(process.env.SCENE_COMPILER_PORT ?? 8790)

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value, null, 2))
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function startJob(job, provider) {
  const status = store.readStatus(job.id)
  status.state = 'submitting'
  status.provider = provider
  store.writeStatus(job.id, status)
  const jobPath = resolve(store.jobDir(job.id), 'job.json')
  const child = spawn(process.execPath, [resolve(projectRoot, 'pipeline/compiler/compile.mjs'), jobPath], {
    cwd: projectRoot,
    env: { ...process.env, SCENE_COMPILER_PROVIDER: provider },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()))
  child.on('exit', (code) => {
    const current = store.readStatus(job.id)
    current.state = code === 0 ? (provider === 'local-docker' ? 'awaiting-review' : 'submitted') : 'failed'
    current.error = code === 0 ? null : logs.join('').slice(-12000)
    if (code === 0) {
      const output = logs.join('').trim()
      try {
        current.submission = JSON.parse(output)
      } catch {
        current.submission = { raw: output.slice(-12000) }
      }
    }
    store.writeStatus(job.id, current)
  })
}

function assertReviewable(status) {
  if (status.state !== 'awaiting-review' && status.state !== 'approved') {
    throw new Error(`Job is not ready for review: ${status.state}`)
  }
}

function downloadAwsObject(status, suffix, destination) {
  if (!status.submission?.artifactPrefix) throw new Error('AWS artifact prefix is missing')
  const source = `${status.submission.artifactPrefix}/output/${suffix}`
  const download = spawnSync('aws', ['s3', 'cp', source, destination, '--region', process.env.AWS_REGION ?? 'us-east-1'], {
    encoding: 'utf8',
  })
  if (download.status !== 0) throw new Error(download.stderr || 'Could not download AWS artifact')
}

function materializeArtifact(id) {
  const job = store.readJob(id)
  const status = store.readStatus(id)
  assertReviewable(status)
  const runtimeArtifact = resolve(store.jobDir(id), 'review-final.mp4')
  if (existsSync(runtimeArtifact)) return runtimeArtifact

  if (status.provider === 'aws-batch') {
    downloadAwsObject(status, 'final.mp4', runtimeArtifact)
    return runtimeArtifact
  }

  const localArtifact = resolve(projectRoot, job.outputVideo)
  if (!existsSync(localArtifact)) throw new Error(`Rendered artifact does not exist: ${localArtifact}`)
  return localArtifact
}

function materializeReport(id) {
  const job = store.readJob(id)
  const status = store.readStatus(id)
  assertReviewable(status)
  const runtimeReport = resolve(store.jobDir(id), 'review-final-qc.json')
  if (existsSync(runtimeReport)) return runtimeReport

  if (status.provider === 'aws-batch') {
    downloadAwsObject(status, 'reports/final-qc.json', runtimeReport)
    return runtimeReport
  }

  const localReport = resolve(projectRoot, job.workspace, 'reports/final-qc.json')
  if (!existsSync(localReport)) throw new Error(`Final QC report does not exist: ${localReport}`)
  return localReport
}

function streamVideo(request, response, path) {
  const size = statSync(path).size
  const range = request.headers.range
  if (!range) {
    response.writeHead(200, {
      'accept-ranges': 'bytes',
      'content-length': size,
      'content-type': 'video/mp4',
    })
    createReadStream(path).pipe(response)
    return
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) {
    response.writeHead(416, { 'content-range': `bytes */${size}` })
    response.end()
    return
  }
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    response.writeHead(416, { 'content-range': `bytes */${size}` })
    response.end()
    return
  }
  response.writeHead(206, {
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${size}`,
    'content-type': 'video/mp4',
  })
  createReadStream(path, { start, end }).pipe(response)
}

async function refreshStatus(id) {
  const status = store.readStatus(id)
  const remoteJobId = status.submission?.job?.jobId
  if (status.provider !== 'aws-batch' || !remoteJobId) return status
  const { describeAwsBatchJob } = await import('../providers/aws-batch.mjs')
  const remote = describeAwsBatchJob(remoteJobId)
  if (!remote) return status
  status.remote = {
    jobId: remote.jobId,
    status: remote.status,
    statusReason: remote.statusReason ?? null,
    startedAt: remote.startedAt ?? null,
    stoppedAt: remote.stoppedAt ?? null,
  }
  const stateMap = {
    SUBMITTED: 'submitted',
    PENDING: 'pending',
    RUNNABLE: 'runnable',
    STARTING: 'starting',
    RUNNING: 'running',
    SUCCEEDED: 'awaiting-review',
    FAILED: 'failed',
  }
  status.state = stateMap[remote.status] ?? status.state
  store.writeStatus(id, status)
  return status
}

function publishApprovedArtifact(id) {
  const job = store.readJob(id)
  const status = store.readStatus(id)
  assertReviewable(status)
  const runtimeDir = store.jobDir(id)
  const artifact = materializeArtifact(id)
  if (!existsSync(artifact)) throw new Error(`Approved artifact does not exist: ${artifact}`)
  const publish = spawnSync(
    process.execPath,
    [
      resolve(projectRoot, 'pipeline/compiler/publish.mjs'),
      '--job',
      resolve(runtimeDir, 'job.json'),
      '--artifact',
      artifact,
    ],
    { cwd: projectRoot, encoding: 'utf8' },
  )
  if (publish.status !== 0) throw new Error(publish.stderr || 'Publishing approved artifact failed')
  status.state = 'published'
  status.published = JSON.parse(publish.stdout)
  store.writeStatus(id, status)
  return status
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const parts = url.pathname.split('/').filter(Boolean)
    if (request.method === 'GET' && url.pathname === '/health') {
      send(response, 200, { ok: true, service: 'scene-compiler', provider: process.env.SCENE_COMPILER_PROVIDER ?? 'local-docker' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/jobs') {
      send(response, 200, { jobs: store.list() })
      return
    }
    if (request.method === 'POST' && url.pathname === '/jobs') {
      const payload = await body(request)
      const job = validateCompilerJob(payload.job ?? payload)
      const provider = payload.provider ?? process.env.SCENE_COMPILER_PROVIDER ?? 'local-docker'
      const status = store.create(job)
      startJob(job, provider)
      send(response, 202, status)
      return
    }
    if (parts[0] === 'jobs' && parts[1] && request.method === 'GET' && parts.length === 2) {
      send(response, 200, { status: await refreshStatus(parts[1]), job: store.readJob(parts[1]) })
      return
    }
    if (parts[0] === 'jobs' && parts[1] && parts[2] === 'artifact' && request.method === 'GET') {
      await refreshStatus(parts[1])
      streamVideo(request, response, materializeArtifact(parts[1]))
      return
    }
    if (parts[0] === 'jobs' && parts[1] && parts[2] === 'report' && request.method === 'GET') {
      await refreshStatus(parts[1])
      send(response, 200, JSON.parse(readFileSync(materializeReport(parts[1]), 'utf8')))
      return
    }
    if (parts[0] === 'jobs' && parts[1] && parts[2] === 'approve' && request.method === 'POST') {
      const payload = await body(request)
      const published = publishApprovedArtifact(parts[1])
      store.approve(parts[1], payload.reviewer ?? 'human-reviewer', published.published)
      send(response, 200, store.readStatus(parts[1]))
      return
    }
    send(response, 404, { error: 'Not found' })
  } catch (error) {
    send(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Scene compiler API listening on http://127.0.0.1:${port}`)
})
