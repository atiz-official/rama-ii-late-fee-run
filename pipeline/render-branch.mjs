import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? resolve(scriptDir, 'scenes/breakaway-finish/double-shot.json'))
const manifestDir = dirname(manifestPath)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const source = resolve(manifestDir, manifest.source)
const ballAsset = resolve(manifestDir, manifest.ballAsset)
const output = resolve(manifestDir, manifest.output)

function number(value) {
  return Number(value.toFixed(5))
}

function interpolateExpression(keyframes, property, timeOffset = 0) {
  const shiftedTime = timeOffset === 0 ? 't' : `(t-${number(timeOffset)})`
  let expression = String(keyframes.at(-1)[property])

  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const from = keyframes[index]
    const to = keyframes[index + 1]
    const duration = number(to.time - from.time)
    const distance = number(to[property] - from[property])
    const progress = `((${shiftedTime}-${number(from.time)})/${duration})`
    const segment = `${number(from[property])}+${distance}*${progress}`
    expression = `if(lt(${shiftedTime},${number(to.time)}),${segment},${expression})`
  }

  return `if(lt(${shiftedTime},${number(keyframes[0].time)}),${number(keyframes[0][property])},${expression})`
}

function ballScaleExpression() {
  const duration = number(manifest.impactTime - manifest.contactTime)
  const distance = number(manifest.ballSize.end - manifest.ballSize.start)
  return `max(${manifest.ballSize.end},min(${manifest.ballSize.start},${manifest.ballSize.start}+${distance}*((t-${manifest.contactTime})/${duration})))`
}

const xMain = interpolateExpression(manifest.trajectory, 'x')
const yMain = interpolateExpression(manifest.trajectory, 'y')
const xTrailA = interpolateExpression(manifest.trajectory, 'x', 0.025)
const yTrailA = interpolateExpression(manifest.trajectory, 'y', 0.025)
const xTrailB = interpolateExpression(manifest.trajectory, 'x', 0.05)
const yTrailB = interpolateExpression(manifest.trajectory, 'y', 0.05)
const enabled = `between(t,${manifest.contactTime},${manifest.endTime})`
const scale = ballScaleExpression()

const filters = [
  `[1:v]format=rgba,eq=saturation=0.68:contrast=0.92:brightness=-0.025,scale=w='${scale}':h='${scale}':eval=frame,rotate='7.5*t':c=none:ow=rotw(iw):oh=roth(ih),gblur=sigma=0.48,split=3[ball-main][ball-trail-a][ball-trail-b]`,
  `[ball-trail-a]colorchannelmixer=aa=0.16,gblur=sigma=0.85[trail-a]`,
  `[ball-trail-b]colorchannelmixer=aa=0.06,gblur=sigma=1.25[trail-b]`,
  `[0:v][trail-b]overlay=x='${xTrailB}-overlay_w/2':y='${yTrailB}-overlay_h/2':enable='${enabled}':eval=frame[v1]`,
  `[v1][trail-a]overlay=x='${xTrailA}-overlay_w/2':y='${yTrailA}-overlay_h/2':enable='${enabled}':eval=frame[v2]`,
  `[v2][ball-main]overlay=x='${xMain}-overlay_w/2':y='${yMain}-overlay_h/2':enable='${enabled}':eval=frame[vout]`
]

const args = [
  '-hide_banner',
  '-y',
  '-i',
  source,
  '-loop',
  '1',
  '-framerate',
  String(manifest.fps),
  '-i',
  ballAsset,
  '-filter_complex',
  filters.join(';'),
  '-map',
  '[vout]',
  '-map',
  '0:a?',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '16',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart',
  '-shortest',
  output
]

console.log(`Rendering ${manifest.id}`)
console.log(`Source: ${source}`)
console.log(`Output: ${output}`)

const result = spawnSync(ffmpegPath, args, { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

console.log('Render complete')
