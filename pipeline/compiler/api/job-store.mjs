import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export class JobStore {
  constructor(root) {
    this.root = resolve(root)
    mkdirSync(this.root, { recursive: true })
  }

  jobDir(id) {
    return resolve(this.root, id)
  }

  create(job) {
    const directory = this.jobDir(job.id)
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, 'job.json'), JSON.stringify(job, null, 2))
    const status = {
      id: job.id,
      state: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: null,
      submission: null,
      error: null,
    }
    this.writeStatus(job.id, status)
    return status
  }

  writeStatus(id, status) {
    status.updatedAt = new Date().toISOString()
    writeFileSync(resolve(this.jobDir(id), 'status.json'), JSON.stringify(status, null, 2))
  }

  readStatus(id) {
    return JSON.parse(readFileSync(resolve(this.jobDir(id), 'status.json'), 'utf8'))
  }

  readJob(id) {
    return JSON.parse(readFileSync(resolve(this.jobDir(id), 'job.json'), 'utf8'))
  }

  list() {
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readStatus(entry.name))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  approve(id, reviewer, published) {
    const approval = {
      jobId: id,
      reviewer,
      approvedAt: new Date().toISOString(),
      published,
    }
    writeFileSync(resolve(this.jobDir(id), 'approval.json'), JSON.stringify(approval, null, 2))
    const status = this.readStatus(id)
    status.approval = approval
    this.writeStatus(id, status)
    return approval
  }
}
