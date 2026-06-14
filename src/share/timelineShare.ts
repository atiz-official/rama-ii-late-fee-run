import type { PlayableMomentScenario, TimelineOutcome } from '../engine/types'

type BrowserWindowWithAudio = typeof window & { webkitAudioContext?: typeof AudioContext }

export function getTimelineLabel(seed: number) {
  return `#${seed.toString(16).toUpperCase()}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function captureTimeline(scenario: PlayableMomentScenario, outcome: TimelineOutcome, timelineId: string) {
  const text = `${scenario.resultShareTitle}: ${outcome.label} ${timelineId}`
  if (navigator.share) {
    await navigator.share({
      title: scenario.resultShareTitle,
      text,
      url: window.location.href,
    })
    return
  }

  await navigator.clipboard?.writeText(`${text} ${window.location.href}`)
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.fill()
}

function drawObjectCover(context: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  const videoWidth = video.videoWidth || width
  const videoHeight = video.videoHeight || height
  const scale = Math.max(width / videoWidth, height / videoHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (videoWidth - sourceWidth) / 2
  const sourceY = (videoHeight - sourceHeight) / 2
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

function drawShareOverlay(context: CanvasRenderingContext2D, outcome: TimelineOutcome, timelineId: string, progress: number, width: number, height: number) {
  const safeX = 54
  const topY = 84
  context.save()
  context.fillStyle = 'rgba(0, 0, 0, 0.28)'
  context.fillRect(0, 0, width, height)

  context.fillStyle = 'rgba(187, 255, 206, 0.92)'
  drawRoundedRect(context, safeX, topY, 370, 72, 30)
  context.fillStyle = '#05100c'
  context.font = '900 31px Arial, sans-serif'
  context.fillText('PLAYABLE TIMELINE', safeX + 28, topY + 47)

  context.fillStyle = 'rgba(8, 13, 11, 0.82)'
  drawRoundedRect(context, safeX, height - 338, width - safeX * 2, 236, 30)
  context.fillStyle = '#ffe88c'
  context.font = '900 27px Arial, sans-serif'
  context.fillText(`${timelineId} - ${outcome.rarity.toUpperCase()} - ${outcome.odds}`, safeX + 34, height - 280)
  context.fillStyle = '#fffbe6'
  context.font = '900 62px Arial, sans-serif'
  context.fillText(outcome.label, safeX + 34, height - 200)
  context.fillStyle = 'rgba(255, 255, 255, 0.78)'
  context.font = '500 31px Arial, sans-serif'
  context.fillText(outcome.caption, safeX + 34, height - 142)
  context.fillStyle = 'rgba(255, 255, 255, 0.62)'
  context.font = '700 24px Arial, sans-serif'
  context.fillText('Play the match-deciding moment. Rewrite the timeline.', safeX + 34, height - 93)

  outcome.beats.slice(0, 3).forEach((beat, index) => {
    const chipX = safeX + 34 + index * 198
    const chipY = height - 74
    context.fillStyle = 'rgba(255, 255, 255, 0.08)'
    drawRoundedRect(context, chipX, chipY, 182, 34, 12)
    context.fillStyle = 'rgba(255, 255, 255, 0.72)'
    context.font = '700 15px Arial, sans-serif'
    context.fillText(beat.slice(0, 24), chipX + 10, chipY + 22)
  })

  context.fillStyle = outcome.rarityTier === 'absurd' ? 'rgba(181, 255, 204, 0.9)' : outcome.rarityTier === 'cursed' ? 'rgba(184, 140, 255, 0.9)' : 'rgba(255, 232, 140, 0.9)'
  drawRoundedRect(context, width - 310, 92, 250, 52, 18)
  context.fillStyle = '#07100d'
  context.font = '900 22px Arial, sans-serif'
  context.fillText(outcome.crowdSign.slice(0, 18), width - 286, 126)

  const ballStartX = width * 0.46
  const ballStartY = height * 0.63
  const ballEndX = width * (outcome.target.x / 100)
  const ballEndY = height * (0.21 + outcome.target.y / 190)
  const eased = 1 - Math.pow(1 - Math.min(1, progress), 2.4)
  const ballX = ballStartX + (ballEndX - ballStartX) * eased
  const ballY = ballStartY + (ballEndY - ballStartY) * eased - Math.sin(progress * Math.PI) * 150

  context.shadowColor = outcome.ballColor
  context.shadowBlur = 28
  context.fillStyle = '#f8f8f2'
  context.beginPath()
  context.arc(ballX, ballY, 15 - eased * 6, 0, Math.PI * 2)
  context.fill()
  context.shadowBlur = 0

  if (outcome.effect === 'multi') {
    context.globalAlpha = Math.max(0, 0.65 - Math.abs(progress - 0.36) * 2.2)
    context.fillStyle = 'rgba(187, 255, 206, 0.24)'
    context.beginPath()
    context.ellipse(width * 0.42, height * 0.64, 160, 44, -0.35, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = 'rgba(154, 255, 208, 0.88)'
    context.beginPath()
    context.arc(ballX + 70 * Math.sin(progress * Math.PI), ballY + 44, Math.max(3, 12 - eased * 5), 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = 1
  }

  context.restore()
}

function waitForEvent(target: EventTarget, eventName: string) {
  return new Promise<void>((resolve) => {
    target.addEventListener(eventName, () => resolve(), { once: true })
  })
}

function rampGain(gain: GainNode, start: number, peak: number, attack: number, release: number) {
  gain.gain.cancelScheduledValues(start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + release)
}

function scheduleShareTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  options: { type?: OscillatorType; gain?: number; detune?: number } = {},
) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = frequency > 600 ? 2600 : 520
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(frequency, start)
  if (options.detune) osc.detune.setValueAtTime(options.detune, start)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  rampGain(gain, start, options.gain ?? 0.05, 0.012, duration)
  osc.start(start)
  osc.stop(start + duration + 0.08)
}

function scheduleShareNoise(
  context: AudioContext,
  destination: AudioNode,
  start: number,
  duration: number,
  options: { gain?: number; lowpass?: number; highpass?: number } = {},
) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < frameCount; index += 1) {
    const tail = 1 - index / frameCount
    data[index] = (Math.random() * 2 - 1) * Math.max(0.06, tail)
  }

  const source = context.createBufferSource()
  const gain = context.createGain()
  const lowpass = context.createBiquadFilter()
  const highpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = options.lowpass ?? 3600
  highpass.type = 'highpass'
  highpass.frequency.value = options.highpass ?? 120
  source.buffer = buffer
  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(destination)
  rampGain(gain, start, options.gain ?? 0.05, 0.025, duration)
  source.start(start)
  source.stop(start + duration + 0.08)
}

function scheduleShareAudio(context: AudioContext, destination: AudioNode, outcome: TimelineOutcome) {
  const start = context.currentTime + 0.12

  scheduleShareNoise(context, destination, start, 4.15, { gain: 0.035, lowpass: 2400, highpass: 160 })
  scheduleShareTone(context, destination, 1420, start + 0.1, 0.24, { gain: 0.065, type: 'square' })
  scheduleShareTone(context, destination, 68, start + 1.14, 0.32, { gain: 0.105, type: 'triangle' })
  scheduleShareNoise(context, destination, start + 1.16, 0.16, { gain: 0.048, lowpass: 900, highpass: 70 })

  if (outcome.impact === 'net') {
    scheduleShareNoise(context, destination, start + 1.82, 0.44, { gain: 0.078, lowpass: 4400, highpass: 720 })
    scheduleShareTone(context, destination, 720, start + 1.86, 0.3, { gain: 0.035, type: 'triangle' })
    scheduleShareNoise(context, destination, start + 2.06, 2.05, { gain: 0.12, lowpass: 5200, highpass: 150 })
  } else if (outcome.impact === 'save') {
    scheduleShareTone(context, destination, 92, start + 1.76, 0.28, { gain: 0.12, type: 'sawtooth' })
    scheduleShareNoise(context, destination, start + 1.78, 0.48, { gain: 0.075, lowpass: 1700, highpass: 130 })
    scheduleShareNoise(context, destination, start + 2.18, 1.65, { gain: 0.065, lowpass: 2600, highpass: 240 })
  } else if (outcome.impact === 'post') {
    scheduleShareTone(context, destination, 920, start + 1.78, 0.62, { gain: 0.13, type: 'square' })
    scheduleShareTone(context, destination, 1380, start + 1.83, 0.34, { gain: 0.042, type: 'triangle' })
    scheduleShareNoise(context, destination, start + 2.24, 1.55, { gain: 0.052, lowpass: 2300, highpass: 160 })
  } else if (outcome.impact === 'portal') {
    scheduleShareTone(context, destination, 128, start + 1.78, 1.05, { gain: 0.082, type: 'sawtooth' })
    scheduleShareTone(context, destination, 278, start + 1.86, 0.72, { gain: 0.048, type: 'sawtooth', detune: 18 })
    scheduleShareNoise(context, destination, start + 1.82, 1.0, { gain: 0.06, lowpass: 1800, highpass: 220 })
  } else {
    scheduleShareNoise(context, destination, start + 1.85, 0.5, { gain: 0.046, lowpass: 1400, highpass: 220 })
    scheduleShareTone(context, destination, 102, start + 2.15, 1.2, { gain: 0.028, type: 'sine' })
  }

  if (outcome.effect === 'multi') {
    scheduleShareTone(context, destination, 205, start + 1.36, 0.5, { gain: 0.065, type: 'sawtooth' })
    scheduleShareNoise(context, destination, start + 1.46, 1.45, { gain: 0.108, lowpass: 5600, highpass: 260 })
  }
}

function createShareAudioStream(outcome: TimelineOutcome) {
  const AudioContextClass = window.AudioContext || (window as BrowserWindowWithAudio).webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass()
  if (context.state === 'suspended') void context.resume()
  const destination = context.createMediaStreamDestination()
  scheduleShareAudio(context, destination, outcome)
  return { context, stream: destination.stream }
}

export async function exportTimelineClip(sourceUrl: string, scenario: PlayableMomentScenario, outcome: TimelineOutcome, timelineId: string) {
  if (!window.MediaRecorder) {
    await captureTimeline(scenario, outcome, timelineId)
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 1280
  const context = canvas.getContext('2d')
  if (!context) return
  if (typeof canvas.captureStream !== 'function') {
    await captureTimeline(scenario, outcome, timelineId)
    return
  }

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  const loadedMetadata = waitForEvent(video, 'loadedmetadata')
  video.src = sourceUrl
  await loadedMetadata
  video.currentTime = Math.max(0, scenario.decisionTime - 1.2)
  await waitForEvent(video, 'seeked')
  await video.play().catch(() => undefined)

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
  const stream = canvas.captureStream(30)
  const shareAudio = await (async () => {
    try {
      return createShareAudioStream(outcome)
    } catch {
      return null
    }
  })()
  shareAudio?.stream.getAudioTracks().forEach((track) => stream.addTrack(track))

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: shareAudio ? 160_000 : undefined })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  const duration = 4200
  const start = performance.now()
  recorder.start()

  await new Promise<void>((resolve) => {
    const frame = () => {
      const elapsed = performance.now() - start
      const progress = Math.min(1, elapsed / duration)
      drawObjectCover(context, video, canvas.width, canvas.height)
      drawShareOverlay(context, outcome, timelineId, progress, canvas.width, canvas.height)
      if (progress >= 1) {
        resolve()
        return
      }
      requestAnimationFrame(frame)
    }
    frame()
  })

  recorder.stop()
  await stopped
  video.pause()
  stream.getTracks().forEach((track) => track.stop())
  await shareAudio?.context.close().catch(() => undefined)

  const blob = new Blob(chunks, { type: 'video/webm' })
  const filename = `aiartgames-${timelineId.replace('#', '')}-${outcome.id}.webm`
  const file = new File([blob], filename, { type: 'video/webm' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: scenario.resultShareTitle,
      text: `${outcome.label} ${timelineId}`,
    })
    return
  }

  downloadBlob(blob, filename)
}
