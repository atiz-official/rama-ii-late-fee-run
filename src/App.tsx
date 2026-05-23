import { Canvas } from '@react-three/fiber'
import { KeyboardControls, Preload } from '@react-three/drei'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Octagon, RotateCcw, Share2, Video } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import type { WebGLRenderer } from 'three'
import { GameScene } from './components/GameScene'
import { Hud } from './components/Hud'
import { useGameStore } from './game/store'
import type { DriveControl } from './game/store'
import './App.css'

const controls = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'brake', keys: ['Space'] },
]

function App() {
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
    shimmer: OscillatorNode
    shimmerGain: GainNode
  } | null>(null)
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

    const padNotes = [196, 246.94, 293.66, 369.99]
    const pad = padNotes.map((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = index % 2 ? 'sine' : 'triangle'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.012
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start()
      return { oscillator, gain }
    })

    const shimmer = context.createOscillator()
    const shimmerGain = context.createGain()
    shimmer.type = 'sine'
    shimmer.frequency.value = 880
    shimmerGain.gain.value = 0.002
    shimmer.connect(shimmerGain)
    shimmerGain.connect(master)
    shimmer.start()

    musicRef.current = { master, pad, shimmer, shimmerGain }
    return musicRef.current
  }

  useEffect(() => {
    if (!soundEnabled || status !== 'running') {
      engineGainRef.current?.gain.setTargetAtTime(0, contextRef.current?.currentTime ?? 0, 0.05)
      musicRef.current?.master.gain.setTargetAtTime(0, contextRef.current?.currentTime ?? 0, 0.18)
      return
    }

    const context = ensureAudioContext()
    if (!context) return
    const music = ensureMusic(context)

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
    engineRef.current.frequency.setTargetAtTime(42 + speed * 1.15, context.currentTime, 0.16)
    engineGainRef.current?.gain.setTargetAtTime(0.006 + Math.min(0.024, speed / 1400), context.currentTime, 0.12)
    music.master.gain.setTargetAtTime(0.26 + relaxedMood * 0.08, context.currentTime, 0.3)
    music.pad.forEach(({ oscillator, gain }, index) => {
      const drift = Math.sin(context.currentTime * (0.12 + index * 0.025)) * (0.5 + index * 0.12)
      oscillator.detune.setTargetAtTime(drift, context.currentTime, 0.25)
      gain.gain.setTargetAtTime(0.008 + relaxedMood * 0.008 + Math.min(0.004, speed / 9000), context.currentTime, 0.35)
    })
    music.shimmerGain.gain.setTargetAtTime(speed > 8 ? 0.0025 + relaxedMood * 0.002 : 0.001, context.currentTime, 0.35)
  }, [soundEnabled, speed, status, stress])

  useEffect(() => {
    if (!soundEnabled || collisions <= lastCollisionRef.current) {
      lastCollisionRef.current = collisions
      return
    }

    const context = ensureAudioContext()
    if (!context) return

    ;[659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(index ? 0.035 : 0.026, context.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42 + index * 0.08)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(context.currentTime + index * 0.035)
      oscillator.stop(context.currentTime + 0.55 + index * 0.08)
    })
    lastCollisionRef.current = collisions
  }, [collisions, soundEnabled])

  return null
}

export default App
