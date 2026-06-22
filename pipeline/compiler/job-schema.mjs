const requiredTopLevel = [
  'schemaVersion',
  'id',
  'scenarioId',
  'branchId',
  'sourceVideo',
  'outputVideo',
  'workspace',
  'video',
  'models',
  'objects',
  'edits',
  'deterministicComposite',
  'quality',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateCompilerJob(job) {
  assert(job && typeof job === 'object' && !Array.isArray(job), 'Job must be a JSON object')
  for (const key of requiredTopLevel) assert(key in job, `Missing job field: ${key}`)
  assert(job.schemaVersion === 1, `Unsupported schemaVersion: ${job.schemaVersion}`)
  assert(/^[a-z0-9][a-z0-9-]+$/.test(job.id), 'Job id must be lowercase kebab-case')
  assert(job.video.fps > 0, 'video.fps must be positive')
  assert(job.video.contactFrame >= 0, 'video.contactFrame must be non-negative')
  assert(job.video.endFrame > job.video.contactFrame, 'video.endFrame must follow contactFrame')
  assert(job.video.width > 0 && job.video.height > 0, 'Video dimensions must be positive')
  assert(Array.isArray(job.objects) && job.objects.length > 0, 'At least one tracked object is required')
  assert(Array.isArray(job.edits) && job.edits.length > 0, 'At least one edit stage is required')

  const objectNames = new Set()
  for (const object of job.objects) {
    assert(Number.isInteger(object.id) && object.id > 0, `Invalid object id for ${object.name}`)
    assert(typeof object.name === 'string' && object.name.length > 0, 'Tracked object name is required')
    assert(!objectNames.has(object.name), `Duplicate tracked object name: ${object.name}`)
    objectNames.add(object.name)
    assert(Array.isArray(object.box) && object.box.length === 4, `Object ${object.name} needs a four-value box`)
    const [x1, y1, x2, y2] = object.box
    assert(x2 > x1 && y2 > y1, `Object ${object.name} has an invalid box`)
    assert(x1 >= 0 && y1 >= 0 && x2 <= job.video.width && y2 <= job.video.height, `Object ${object.name} box is outside the frame`)
  }

  for (const edit of job.edits) {
    assert(Array.isArray(edit.objects) && edit.objects.length > 0, `Edit ${edit.id} needs object masks`)
    for (const objectName of edit.objects) {
      assert(objectNames.has(objectName), `Edit ${edit.id} references unknown object: ${objectName}`)
    }
    assert(typeof edit.prompt === 'string' && edit.prompt.length >= 40, `Edit ${edit.id} needs a specific prompt`)
  }

  assert(job.models.tracker.provider === 'sam2', 'The v1 tracker must use SAM 2')
  assert(job.models.editor.provider === 'vace', 'The v1 editor must use VACE')
  assert(job.models.editor.seeds?.length >= 3, 'At least three editor seeds are required for candidate selection')
  assert(job.quality.requireHumanReview === true, 'Generated human reactions must require human review')
  return job
}
