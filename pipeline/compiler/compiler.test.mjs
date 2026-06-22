import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { createJobPlan } from './job-plan.mjs'
import { validateCompilerJob } from './job-schema.mjs'

const projectRoot = resolve(import.meta.dirname, '../..')
const fixture = JSON.parse(readFileSync(resolve(projectRoot, 'pipeline/jobs/breakaway-double-shot-gpu.json'), 'utf8'))

test('validates the production breakaway job', () => {
  assert.equal(validateCompilerJob(structuredClone(fixture)).id, 'breakaway-double-shot-gpu-v1')
})

test('rejects an object box outside the source frame', () => {
  const invalid = structuredClone(fixture)
  invalid.objects[0].box = [0, 0, 5000, 5000]
  assert.throws(() => validateCompilerJob(invalid), /outside the frame/)
})

test('creates all required compiler stages in order', () => {
  const plan = createJobPlan(fixture, projectRoot)
  assert.deepEqual(
    plan.stages.map((stage) => stage.id),
    [
      'probe',
      'extract',
      'track',
      'mask-qc',
      'mask-video',
      'generate',
      'candidate-qc',
      'select',
      'composite-humans',
      'composite-ball',
      'final-qc',
      'publish',
    ],
  )
})
