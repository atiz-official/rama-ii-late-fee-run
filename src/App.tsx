import { Canvas } from '@react-three/fiber'
import { KeyboardControls, Preload } from '@react-three/drei'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Octagon, RotateCcw, Share2, Video } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import type { WebGLRenderer } from 'three'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'
import { ScenarioLibrary } from './components/ScenarioLibrary'
import { useGameStore } from './game/store'
import type { DriveControl } from './game/store'
import { footballMomentScenarios, getScenario } from './scenarios/footballMoments'
import { PlayableMoment } from './templates/PlayableMoment'
import './App.css'

const controls = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'brake', keys: ['Space'] },
]

function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') !== 'cafe') return <FootballMomentsApp />

  return <CafeRunApp />
}

function FootballMomentsApp() {
  const [scenario, setScenario] = useState(() => getScenario(new URLSearchParams(window.location.search).get('scenario')))
  const [libraryOpen, setLibraryOpen] = useState(false)

  useEffect(() => {
    const syncFromUrl = () => setScenario(getScenario(new URLSearchParams(window.location.search).get('scenario')))
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  function selectScenario(nextScenario: typeof scenario) {
    const url = new URL(window.location.href)
    url.searchParams.delete('mode')
    url.searchParams.set('scenario', nextScenario.id)
    window.history.pushState({}, '', url)
    setScenario(nextScenario)
    setLibraryOpen(false)
  }

  return (
    <>
      <PlayableMoment key={scenario.id} scenario={scenario} />
      <ScenarioLibrary
        activeScenario={scenario}
        open={libraryOpen}
        scenarios={footballMomentScenarios}
        onClose={() => setLibraryOpen(false)}
        onOpen={() => setLibraryOpen(true)}
        onSelect={selectScenario}
      />
    </>
  )
}

function CafeRunApp() {
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)
  const start = useGameStore((state) => state.start)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('autostart') === '1') start()
  }, [start])

  async function shareScreenshot() {
    const canvas = rendererRef.current?.domElement
    if (!canvas) return

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], 'thong-lor-cafe-run.png', { type: 'image/png' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Thong Lor: Cafe Run',
          text: 'I found the scenic coffee spot.',
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function recordClip() {
    const canvas = rendererRef.current?.domElement
    if (!canvas || recording) return

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: BlobPart[] = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'thong-lor-cafe-run-clip.webm'
      link.click()
      URL.revokeObjectURL(url)
      setRecording(false)
    }

    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
    window.setTimeout(() => recorder.stop(), 8000)
  }

  return (
    <main className="game-shell">
      <KeyboardControls map={controls}>
        <Canvas
          shadows
          camera={{ position: [0, 8, -16], fov: 52 }}
          gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            rendererRef.current = gl
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
            gl.outputColorSpace = SRGBColorSpace
          }}
        >
          <Suspense fallback={null}>
            <GameScene />
          </Suspense>
          <Preload all />
        </Canvas>
      </KeyboardControls>

      <Hud />
      <AudioDirector />
      <TouchDriveControls />

      <div className="capture-dock" aria-label="Capture controls">
        <button type="button" onClick={shareScreenshot} title="Share screenshot">
          <Share2 size={17} />
          <span>Share shot</span>
        </button>
        <button type="button" onClick={recordClip} disabled={recording} title="Record 8 second clip">
          {recording ? <Video size={17} className="recording-icon" /> : <Camera size={17} />}
          <span>{recording ? 'Recording' : 'Record clip'}</span>
        </button>
        <button type="button" onClick={start} title="Restart run">
          <RotateCcw size={17} />
          <span>Restart</span>
        </button>
      </div>
    </main>
  )
}

function TouchDriveControls() {
  const status = useGameStore((state) => state.status)
  const setControl = useGameStore((state) => state.setControl)
  const clearControls = useGameStore((state) => state.clearControls)

  useEffect(() => {
    const clear = () => clearControls()
    window.addEventListener('blur', clear)
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    return () => {
      window.removeEventListener('blur', clear)
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
    }
  }, [clearControls])

  function bind(control: DriveControl) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setControl(control, true)
      },
      onPointerUp: () => setControl(control, false),
      onPointerCancel: () => setControl(control, false),
      onPointerLeave: () => setControl(control, false),
    }
  }

  return (
    <div className={`touch-controls ${status === 'ready' ? 'is-hidden' : ''}`} aria-label="Touch driving controls">
      <div className="steer-pad">
        <button type="button" aria-label="Steer left" {...bind('left')}>
          <ArrowLeft size={22} />
        </button>
        <button type="button" aria-label="Steer right" {...bind('right')}>
          <ArrowRight size={22} />
        </button>
      </div>
      <div className="pedal-pad">
        <button type="button" aria-label="Accelerate" {...bind('forward')}>
          <ArrowUp size={22} />
        </button>
        <button type="button" aria-label="Brake" {...bind('brake')}>
          <Octagon size={20} />
        </button>
        <button type="button" aria-label="Reverse" {...bind('backward')}>
          <ArrowDown size={22} />
        </button>
      </div>
    </div>
  )
}

function AudioDirector() {
  const { status, soundEnabled, speed, stress, collisions } = useGameStore()
  const contextRef = useRef<AudioContext | null>(null)
  const engineRef = useRef<OscillatorNode | null>(null)
  const engineGainRef = useRef<GainNode | null>(null)
  const musicRef = useRef<{
    master: GainNode
    pad: Array<{ oscillator: OscillatorNode; gain: GainNode }>
    warmth: BiquadFilterNode
  } | null>(null)
  const grooveTimerRef = useRef<number | null>(null)
  const grooveStepRef = useRef(0)
  const lastCollisionRef = useRef(0)

  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    if (!contextRef.current) contextRef.current = new AudioContextClass()
    const context = contextRef.current
    void context.resume()
    return context
  }

  function ensureMusic(context: AudioContext) {
    if (musicRef.current) return musicRef.current

    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)

    const warmth = context.createBiquadFilter()
    warmth.type = 'lowpass'
    warmth.frequency.value = 1450
    warmth.Q.value = 0.55
    warmth.connect(master)

    const padNotes = [174.61, 220, 261.63, 329.63]
    const pad = padNotes.map((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = index % 2 ? 'triangle' : 'sine'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.007
      oscillator.connect(gain)
      gain.connect(warmth)
      oscillator.start()
      return { oscillator, gain }
    })

    musicRef.current = { master, pad, warmth }
    return musicRef.current
  }

  function playCafeTone(context: AudioContext, destination: AudioNode, frequency: number, start: number, duration: number, gainValue: number, type: OscillatorType = 'triangle') {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const filter = context.createBiquadFilter()
    oscillator.type = type
    oscillator.frequency.value = frequency
    filter.type = 'lowpass'
    filter.frequency.value = 1700
    filter.Q.value = 0.42
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.03)
  }

  function playSoftNoise(context: AudioContext, destination: AudioNode, start: number, duration: number, gainValue: number, tone: 'hat' | 'brush') {
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    filter.type = tone === 'hat' ? 'highpass' : 'bandpass'
    filter.frequency.value = tone === 'hat' ? 5200 : 900
    filter.Q.value = tone === 'hat' ? 0.7 : 1.2
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.buffer = buffer
    source.connect(filter)
    filter.connect(gain)
    gain.connect(destination)
    source.start(start)
  }

  function startCafeGroove(context: AudioContext) {
    const music = ensureMusic(context)
    if (grooveTimerRef.current !== null) return
    grooveStepRef.current = 0
    const chords = [
      [220, 261.63, 329.63],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [196, 246.94, 329.63],
    ]
    grooveTimerRef.current = window.setInterval(() => {
      const step = grooveStepRef.current
      const now = context.currentTime + 0.025
      if (step % 8 === 0) {
        chords[(step / 8) % chords.length].forEach((note, index) => playCafeTone(context, music.master, note * 2, now + index * 0.025, 0.42, 0.012, 'triangle'))
      }
      if (step % 4 === 0) playCafeTone(context, music.master, 82.41, now, 0.13, 0.018, 'sine')
      if (step % 2 === 1) playSoftNoise(context, music.master, now, 0.055, 0.007, 'hat')
      if (step % 8 === 5) playSoftNoise(context, music.master, now, 0.16, 0.01, 'brush')
      grooveStepRef.current = (step + 1) % 32
    }, 360)
  }

  function stopCafeGroove() {
    if (grooveTimerRef.current === null) return
    window.clearInterval(grooveTimerRef.current)
    grooveTimerRef.current = null
  }

  useEffect(() => {
    if (!soundEnabled || status !== 'running') {
      engineGainRef.current?.gain.setTargetAtTime(0, contextRef.current?.currentTime ?? 0, 0.05)
      musicRef.current?.master.gain.setTargetAtTime(0, contextRef.current?.currentTime ?? 0, 0.18)
      stopCafeGroove()
      return
    }

    const context = ensureAudioContext()
    if (!context) return
    const music = ensureMusic(context)
    startCafeGroove(context)

    if (!engineRef.current) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      gain.gain.value = 0
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start()
      engineRef.current = oscillator
      engineGainRef.current = gain
    }

    const relaxedMood = Math.max(0, 100 - stress) / 100
    engineRef.current.frequency.setTargetAtTime(36 + speed * 0.85, context.currentTime, 0.16)
    engineGainRef.current?.gain.setTargetAtTime(0.004 + Math.min(0.014, speed / 1800), context.currentTime, 0.12)
    music.master.gain.setTargetAtTime(0.18 + relaxedMood * 0.06, context.currentTime, 0.3)
    music.pad.forEach(({ oscillator, gain }, index) => {
      const drift = Math.sin(context.currentTime * (0.08 + index * 0.018)) * (0.22 + index * 0.06)
      oscillator.detune.setTargetAtTime(drift, context.currentTime, 0.25)
      gain.gain.setTargetAtTime(0.004 + relaxedMood * 0.004 + Math.min(0.002, speed / 10000), context.currentTime, 0.35)
    })
    // WebAudio nodes and timers are intentionally held in refs; recreating the groove callbacks on every frame would restart the music.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled, speed, status, stress])

  useEffect(() => {
    if (!soundEnabled || collisions <= lastCollisionRef.current) {
      lastCollisionRef.current = collisions
      return
    }

    const context = ensureAudioContext()
    if (!context) return

    playSoftNoise(context, context.destination, context.currentTime, 0.12, 0.012, 'brush')
    ;[392, 523.25].forEach((frequency, index) => playCafeTone(context, context.destination, frequency, context.currentTime + index * 0.045, 0.28, index ? 0.018 : 0.014, 'triangle'))
    lastCollisionRef.current = collisions
  }, [collisions, soundEnabled])

  return null
}

export default App
