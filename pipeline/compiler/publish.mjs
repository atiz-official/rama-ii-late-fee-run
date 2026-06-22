import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCompilerJob } from './job-schema.mjs'

const compilerDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(compilerDir, '../..')
const args = process.argv.slice(2)
const jobArg = args[args.indexOf('--job') + 1]
const artifactArg = args[args.indexOf('--artifact') + 1]
if (!jobArg || !artifactArg) throw new Error('--job and --artifact are required')

const job = validateCompilerJob(JSON.parse(readFileSync(resolve(projectRoot, jobArg), 'utf8')))
const artifact = resolve(projectRoot, artifactArg)
const output = resolve(projectRoot, job.outputVideo)
if (!existsSync(artifact)) throw new Error(`Approved artifact not found: ${artifact}`)
mkdirSync(dirname(output), { recursive: true })
if (artifact !== output) copyFileSync(artifact, output)

const catalogPath = resolve(projectRoot, 'public/footage/branches/catalog.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
catalog.scenarios ??= {}
catalog.scenarios[job.scenarioId] ??= {}
catalog.scenarios[job.scenarioId][job.branchId.replace(/-gpu$/, '')] = {
  asset: job.outputVideo.replace(/^public[\\/]/, '').replaceAll('\\', '/'),
  version: job.id,
  approved: true,
  publishedAt: new Date().toISOString(),
}
const temporary = `${catalogPath}.tmp`
writeFileSync(temporary, JSON.stringify(catalog, null, 2))
renameSync(temporary, catalogPath)
console.log(JSON.stringify({ published: output, catalog: catalogPath }, null, 2))
