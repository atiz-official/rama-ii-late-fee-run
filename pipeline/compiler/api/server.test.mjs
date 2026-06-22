import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const projectRoot = resolve(import.meta.dirname, '../../..')
const fixture = JSON.parse(readFileSync(resolve(projectRoot, 'pipeline/jobs/breakaway-double-shot-gpu.json'), 'utf8'))

test('serves health and validates submitted jobs', async (context) => {
  const runtime = mkdtempSync(join(tmpdir(), 'scene-compiler-api-'))
  const artifact = join(runtime, 'rendered-branch.mp4')
  const workspace = join(runtime, 'worker')
  const testFixture = structuredClone(fixture)
  testFixture.outputVideo = artifact
  testFixture.workspace = workspace
  copyFileSync(resolve(projectRoot, 'public/footage/branches/breakaway-finish/double-shot-v1.mp4'), artifact)
  const port = 18790
  const child = spawn(process.execPath, [resolve(projectRoot, 'pipeline/compiler/api/server.mjs')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SCENE_COMPILER_PORT: String(port),
      SCENE_COMPILER_RUNTIME_DIR: runtime,
      SCENE_COMPILER_PROVIDER: 'unsupported-test-provider',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  context.after(() => child.kill())
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('API did not start')), 5000)
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Scene compiler API listening')) {
        clearTimeout(timeout)
        resolveReady()
      }
    })
    child.on('exit', (code) => reject(new Error(`API exited early: ${code}`)))
  })

  const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json())
  assert.equal(health.ok, true)

  const invalid = structuredClone(fixture)
  invalid.objects[0].box = [0, 0, 9000, 9000]
  const invalidResponse = await fetch(`http://127.0.0.1:${port}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(invalid),
  })
  assert.equal(invalidResponse.status, 400)

  const accepted = await fetch(`http://127.0.0.1:${port}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(testFixture),
  })
  assert.equal(accepted.status, 202)
  const status = await accepted.json()
  assert.equal(status.id, fixture.id)

  await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  const stored = await fetch(`http://127.0.0.1:${port}/jobs/${fixture.id}`).then((response) => response.json())
  assert.equal(stored.job.branchId, fixture.branchId)
  assert.match(stored.status.state, /submitting|failed/)

  mkdirSync(resolve(workspace, 'reports'), { recursive: true })
  writeFileSync(
    resolve(workspace, 'reports/final-qc.json'),
    JSON.stringify({ passed: true, duration: 8, hasAudio: true }),
  )
  writeFileSync(
    resolve(runtime, fixture.id, 'status.json'),
    JSON.stringify({
      ...stored.status,
      state: 'awaiting-review',
      provider: 'local-docker',
      updatedAt: new Date().toISOString(),
    }),
  )

  const artifactResponse = await fetch(`http://127.0.0.1:${port}/jobs/${fixture.id}/artifact`, {
    headers: { range: 'bytes=0-99' },
  })
  assert.equal(artifactResponse.status, 206)
  assert.equal((await artifactResponse.arrayBuffer()).byteLength, 100)

  const reportResponse = await fetch(`http://127.0.0.1:${port}/jobs/${fixture.id}/report`)
  assert.equal(reportResponse.status, 200)
  assert.equal((await reportResponse.json()).passed, true)
})
