import type { CrowdBedId, TimelineOutcome } from '../engine/types'

type FootballCue = 'whistle' | 'kick' | 'crowd' | 'portal' | 'tension' | 'net' | 'save' | 'post' | 'chaos'

type BrowserWindowWithAudio = typeof window & { webkitAudioContext?: typeof AudioContext }

let audioContext: AudioContext | null = null
const commentaryTimers: number[] = []

function getAudioContext() {
  const AudioContextClass = window.AudioContext || (window as BrowserWindowWithAudio).webkitAudioContext
  if (!AudioContextClass) return null
  audioContext ??= new AudioContextClass()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

function envelope(gain: GainNode, start: number, peak: number, attack = 0.01, release = 0.35) {
  gain.gain.cancelScheduledValues(start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + release)
}

function tone(frequency: number, duration: number, options: { type?: OscillatorType; gain?: number; detune?: number; delay?: number } = {}) {
  const context = getAudioContext()
  if (!context) return
  const start = context.currentTime + (options.delay ?? 0)
  const osc = context.createOscillator()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = frequency > 600 ? 2200 : 420
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(frequency, start)
  if (options.detune) osc.detune.setValueAtTime(options.detune, start)
  osc.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  envelope(gain, start, options.gain ?? 0.08, 0.008, duration)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

function noise(duration: number, options: { gain?: number; delay?: number; lowpass?: number; highpass?: number } = {}) {
  const context = getAudioContext()
  if (!context) return
  const start = context.currentTime + (options.delay ?? 0)
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frameCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount)
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  const lowpass = context.createBiquadFilter()
  const highpass = context.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = options.lowpass ?? 2600
  highpass.type = 'highpass'
  highpass.frequency.value = options.highpass ?? 90
  source.buffer = buffer
  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(gain)
  gain.connect(context.destination)
  envelope(gain, start, options.gain ?? 0.06, 0.02, duration)
  source.start(start)
  source.stop(start + duration + 0.05)
}

function chant(frequencies: number[], delay: number, gain = 0.035) {
  frequencies.forEach((frequency, index) => {
    tone(frequency, 0.34, { gain, type: 'triangle', delay: delay + index * 0.12 })
  })
}

function crowdBed(kind: CrowdBedId) {
  if (kind === 'roar') {
    noise(2.8, { gain: 0.16, lowpass: 4200, highpass: 120 })
    chant([196, 247, 294, 392], 0.2, 0.032)
    noise(1.1, { gain: 0.08, delay: 0.9, lowpass: 5200, highpass: 900 })
    return
  }

  if (kind === 'hero-chant') {
    noise(2.6, { gain: 0.13, lowpass: 3600, highpass: 180 })
    chant([220, 277, 330, 440, 554], 0.08, 0.038)
    chant([165, 220, 277], 1.0, 0.028)
    return
  }

  if (kind === 'gasp') {
    noise(0.52, { gain: 0.09, lowpass: 1800, highpass: 260, delay: 0.05 })
    noise(1.4, { gain: 0.052, lowpass: 2600, highpass: 190, delay: 0.58 })
    tone(132, 0.7, { gain: 0.026, type: 'triangle', delay: 0.42 })
    return
  }

  if (kind === 'silence') {
    tone(72, 1.3, { gain: 0.018, type: 'sine', delay: 0.08 })
    noise(0.8, { gain: 0.018, lowpass: 700, highpass: 120, delay: 0.45 })
    return
  }

  if (kind === 'post-clang') {
    tone(920, 0.75, { gain: 0.13, type: 'square', delay: 0.02 })
    tone(1380, 0.42, { gain: 0.048, type: 'triangle', delay: 0.07 })
    noise(1.2, { gain: 0.055, lowpass: 2400, highpass: 180, delay: 0.42 })
    return
  }

  if (kind === 'chaos-surge') {
    noise(3.2, { gain: 0.17, lowpass: 5200, highpass: 140 })
    chant([185, 233, 277, 311], 0.12, 0.043)
    tone(74, 1.1, { gain: 0.055, type: 'sawtooth', delay: 0.22 })
    noise(0.5, { gain: 0.085, lowpass: 6200, highpass: 1400, delay: 0.72 })
    return
  }

  if (kind === 'var-confusion') {
    noise(2.0, { gain: 0.06, lowpass: 1700, highpass: 220 })
    tone(440, 0.2, { gain: 0.035, type: 'square', delay: 0.22 })
    tone(440, 0.2, { gain: 0.028, type: 'square', delay: 0.48 })
    tone(118, 1.2, { gain: 0.05, type: 'sawtooth', delay: 0.56 })
    return
  }

  if (kind === 'stunned-laughter') {
    noise(0.62, { gain: 0.05, lowpass: 1400, highpass: 220, delay: 0.16 })
    chant([262, 220, 196, 175], 0.42, 0.026)
    noise(1.6, { gain: 0.055, lowpass: 3200, highpass: 340, delay: 0.92 })
  }
}

function commentarySting(outcome: TimelineOutcome) {
  if (outcome.commentaryStyle === 'thai-chaos') {
    chant([392, 494, 587, 784], 0.08, 0.028)
    return
  }
  if (outcome.commentaryStyle === 'english-drama') {
    chant([165, 220, 330], 0.16, 0.026)
    return
  }
  if (outcome.commentaryStyle === 'var-room') {
    tone(520, 0.16, { gain: 0.026, type: 'square', delay: 0.16 })
    tone(260, 0.42, { gain: 0.03, type: 'sawtooth', delay: 0.42 })
    return
  }
  if (outcome.commentaryStyle === 'meme-table') {
    tone(280, 0.2, { gain: 0.04, type: 'square', delay: 0.08 })
    tone(210, 0.22, { gain: 0.034, type: 'square', delay: 0.24 })
  }
}

export function stopCommentary() {
  commentaryTimers.splice(0).forEach((timer) => window.clearTimeout(timer))
}

export function playFootballCue(kind: FootballCue) {
  if (kind === 'whistle') {
    tone(1440, 0.26, { gain: 0.12, type: 'square' })
    tone(1760, 0.18, { gain: 0.07, type: 'square', delay: 0.11 })
    return
  }

  if (kind === 'tension') {
    noise(1.8, { gain: 0.035, lowpass: 1200, highpass: 180 })
    tone(64, 1.6, { gain: 0.028, type: 'triangle' })
    tone(97, 1.2, { gain: 0.018, type: 'sine', delay: 0.16 })
    return
  }

  if (kind === 'kick') {
    tone(54, 0.32, { gain: 0.18, type: 'triangle' })
    tone(112, 0.16, { gain: 0.1, type: 'sawtooth', delay: 0.012 })
    noise(0.18, { gain: 0.06, lowpass: 900, highpass: 65 })
    return
  }

  if (kind === 'net') {
    noise(0.42, { gain: 0.09, lowpass: 4200, highpass: 700 })
    tone(620, 0.3, { gain: 0.04, type: 'triangle', delay: 0.03 })
    tone(820, 0.26, { gain: 0.035, type: 'triangle', delay: 0.08 })
    return
  }

  if (kind === 'save') {
    tone(86, 0.28, { gain: 0.16, type: 'sawtooth' })
    noise(0.3, { gain: 0.07, lowpass: 1600, highpass: 120 })
    return
  }

  if (kind === 'post') {
    tone(920, 0.46, { gain: 0.12, type: 'square' })
    tone(1380, 0.32, { gain: 0.045, type: 'triangle', delay: 0.04 })
    return
  }

  if (kind === 'chaos') {
    tone(190, 0.42, { gain: 0.08, type: 'sawtooth' })
    tone(330, 0.24, { gain: 0.055, type: 'square', delay: 0.08 })
    noise(0.58, { gain: 0.075, lowpass: 3200, highpass: 140 })
    return
  }

  if (kind === 'portal') {
    tone(140, 0.9, { gain: 0.08, type: 'sawtooth' })
    tone(280, 0.62, { gain: 0.045, type: 'sawtooth', detune: 20 })
    noise(0.8, { gain: 0.06, lowpass: 1800, highpass: 220 })
    return
  }

  if (kind === 'crowd') {
    noise(1.6, { gain: 0.09, lowpass: 3600, highpass: 240 })
    tone(220, 0.8, { gain: 0.025, type: 'triangle', delay: 0.08 })
  }
}

export function playOutcomeCues(outcome: TimelineOutcome) {
  stopCommentary()
  const effect = outcome.effect === 'fan' || outcome.effect === 'multi' ? 'chaos' : outcome.effect === 'portal' ? 'portal' : 'crowd'
  window.setTimeout(() => playFootballCue(effect), effect === 'chaos' ? 80 : 0)
  window.setTimeout(() => {
    if (outcome.impact === 'net') playFootballCue('net')
    if (outcome.impact === 'save') playFootballCue('save')
    if (outcome.impact === 'post') playFootballCue('post')
    if (outcome.impact === 'portal') playFootballCue('portal')
  }, 670)
  window.setTimeout(() => crowdBed(outcome.crowdBed), 780)
  window.setTimeout(() => commentarySting(outcome), 1120)
}
