import { Camera, CircleDot, RotateCcw, Sparkles, Video, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { playFootballCue, playOutcomeCues, stopCommentary } from '../audio/footballAudio'
import { pickFootballOutcome } from '../engine/footballOutcomes'
import { randomSeed } from '../engine/random'
import type { ClipPhase, PlayableMomentScenario, TimelineEnergy, TimelineOutcome } from '../engine/types'
import { getScenario } from '../scenarios/footballMoments'
import { captureTimeline, exportTimelineClip, getTimelineLabel } from '../share/timelineShare'

function getBallFlightStyle(outcome: TimelineOutcome, ballStart: { x: number; y: number }) {
  const midX = (ballStart.x + outcome.target.x) / 2 + outcome.curve * 0.22
  const verticalLift =
    outcome.flight === 'sky' ? 34 : outcome.flight === 'panenka' ? 25 : outcome.flight === 'curl' ? 18 : outcome.flight === 'rising' ? 14 : 8
  const midY = Math.min(ballStart.y, outcome.target.y) - verticalLift
  const endScale = outcome.flight === 'sky' ? 0.28 : outcome.impact === 'save' ? 0.52 : 0.36
  const blur = outcome.flight === 'driven' ? 1.8 : 1.1

  return {
    '--start-x': `${ballStart.x}%`,
    '--start-y': `${ballStart.y}%`,
    '--mid-x': `${midX}%`,
    '--mid-y': `${midY}%`,
    '--end-x': `${outcome.target.x}%`,
    '--end-y': `${outcome.target.y}%`,
    '--ball-color': outcome.ballColor,
    '--spin': `${outcome.spin}deg`,
    '--end-scale': endScale,
    '--motion-blur': `${blur}px`,
  } as CSSProperties
}

function RealisticBallFlight({ outcome, ballStart }: { outcome: TimelineOutcome; ballStart: { x: number; y: number } }) {
  return (
    <div className={`ball-flight effect-${outcome.effect} flight-${outcome.flight}`} style={getBallFlightStyle(outcome, ballStart)}>
      <span className="ball-shadow" />
      <span className="ball-trail" />
      <span className="soccer-ball" aria-hidden>
        <i className="ball-highlight" />
        <i className="ball-stitch stitch-a" />
        <i className="ball-stitch stitch-b" />
        <i className="panel panel-a" />
        <i className="panel panel-b" />
        <i className="panel panel-c" />
        <i className="panel panel-d" />
        <i className="panel panel-e" />
      </span>
    </div>
  )
}

function ActionShock({ outcome }: { outcome: TimelineOutcome }) {
  return (
    <div className={`action-shock shock-${outcome.effect}`} aria-hidden>
      <span className="shock-flash" />
      <span className="shock-speedline line-one" />
      <span className="shock-speedline line-two" />
      <span className="shock-speedline line-three" />
      <span className="crowd-surge" />
    </div>
  )
}

function GoalImpact({ outcome }: { outcome: TimelineOutcome }) {
  return (
    <div
      className={`goal-impact impact-${outcome.impact}`}
      style={
        {
          '--impact-x': `${outcome.target.x}%`,
          '--impact-y': `${outcome.target.y}%`,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="impact-core" />
      <span className="net-line line-a" />
      <span className="net-line line-b" />
      <span className="net-line line-c" />
    </div>
  )
}

function TimelineSplit({ outcome, ballStart }: { outcome: TimelineOutcome; ballStart: { x: number; y: number } }) {
  if (outcome.effect !== 'multi') return null

  return (
    <div className="timeline-split" aria-hidden>
      <span className="split-rift" />
      <span className="split-ball split-ball-a" style={{ '--split-start-x': `${ballStart.x}%`, '--split-start-y': `${ballStart.y}%` } as CSSProperties} />
      <span className="split-ball split-ball-b" style={{ '--split-start-x': `${ballStart.x}%`, '--split-start-y': `${ballStart.y}%` } as CSSProperties} />
    </div>
  )
}

function TimelineAtmosphere({ outcome }: { outcome: TimelineOutcome }) {
  return (
    <div
      className={`timeline-atmosphere crowd-${outcome.crowdBed} keeper-react-${outcome.keeperReaction} player-react-${outcome.playerReaction}`}
      aria-hidden
    >
      <span className="crowd-sign sign-primary">{outcome.crowdSign}</span>
      <span className="crowd-sign sign-secondary">{outcome.rarityTier.toUpperCase()} PULL</span>
      <span className="phone-lights lights-a" />
      <span className="phone-lights lights-b" />
      <span className="commentator-subtitle">{outcome.commentatorLine}</span>
    </div>
  )
}

export function PenaltyRemix({ scenario = getScenario() }: { scenario?: PlayableMomentScenario }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [phase, setPhase] = useState<ClipPhase>('ready')
  const [energy, setEnergy] = useState<TimelineEnergy | null>(null)
  const [meter, setMeter] = useState(0)
  const [outcome, setOutcome] = useState<TimelineOutcome | null>(null)
  const [timelineId, setTimelineId] = useState('')
  const [exportingClip, setExportingClip] = useState(false)
  const animationRef = useRef<number | null>(null)

  const source = `${import.meta.env.BASE_URL}${scenario.baseVideo}`
  const meterScore = useMemo(() => Math.abs(meter - 0.5), [meter])

  useEffect(() => {
    if (phase !== 'timing') {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      animationRef.current = null
      return
    }

    const started = performance.now()
    const tick = () => {
      setMeter(((performance.now() - started) % 1100) / 1100)
      animationRef.current = requestAnimationFrame(tick)
    }
    animationRef.current = requestAnimationFrame(tick)
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'setup') return

    const fallback = window.setTimeout(() => {
      const video = videoRef.current
      if (video && video.currentTime < scenario.decisionTime) {
        video.currentTime = scenario.decisionTime
      }
      video?.pause()
      setPhase('choose')
    }, scenario.decisionTime * 1000 + 650)

    return () => window.clearTimeout(fallback)
  }, [phase, scenario.decisionTime])

  async function start() {
    stopCommentary()
    setPhase('setup')
    setEnergy(null)
    setOutcome(null)
    setTimelineId('')
    setExportingClip(false)
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    video.playbackRate = 1
    video.volume = 0.24
    video.muted = false
    playFootballCue('whistle')
    await video.play().catch(() => undefined)
  }

  function onTimeUpdate() {
    const video = videoRef.current
    if (!video || phase !== 'setup') return
    if (video.currentTime >= scenario.decisionTime) {
      video.pause()
      video.currentTime = scenario.decisionTime
      setPhase('choose')
    }
  }

  function choose(nextEnergy: TimelineEnergy) {
    setEnergy(nextEnergy)
    setPhase('timing')
    playFootballCue('tension')
  }

  function kick() {
    if (!energy) return
    const seed = randomSeed()
    const nextOutcome = pickFootballOutcome(scenario, energy, meter, seed)
    setTimelineId(getTimelineLabel(seed))
    setOutcome(nextOutcome)
    setPhase('result')
    const video = videoRef.current
    if (video) {
      video.currentTime = scenario.decisionTime
      video.playbackRate =
        nextOutcome.cameraTreatment === 'slowmo-punch' ? 0.68 : nextOutcome.cameraTreatment === 'var-glitch' ? 0.78 : 0.88
      video.volume = 0.34
      video.muted = false
      void video.play().catch(() => undefined)
    }
    playFootballCue('kick')
    playOutcomeCues(nextOutcome)
  }

  function onVideoEnded() {
    const video = videoRef.current
    if (!video || phase !== 'result' || !Number.isFinite(video.duration)) return
    video.currentTime = Math.max(scenario.decisionTime, video.duration - 0.08)
    video.pause()
  }

  async function saveShareClip(nextOutcome: TimelineOutcome) {
    setExportingClip(true)
    try {
      await exportTimelineClip(source, scenario, nextOutcome, timelineId)
    } finally {
      setExportingClip(false)
    }
  }

  return (
    <main
      className={`penalty-lab phase-${phase} ${
        outcome ? `outcome-${outcome.effect} impact-${outcome.impact} camera-${outcome.cameraTreatment} rarity-${outcome.rarityTier}` : ''
      }`}
    >
      <section className="penalty-stage" aria-label="Playable news penalty remix">
        <video ref={videoRef} src={source} playsInline preload="auto" onTimeUpdate={onTimeUpdate} onEnded={onVideoEnded} />
        <div className="broadcast-grade" />
        <div className="goal-hotspots" aria-hidden>
          <span className="hotspot left">LEFT</span>
          <span className="hotspot center">CENTER</span>
          <span className="hotspot right">RIGHT</span>
        </div>

        {phase === 'ready' && (
          <div className="penalty-card intro-card">
            <span>{scenario.eyebrow}</span>
            <h1>{scenario.title}</h1>
            <p>{scenario.description}</p>
            <button type="button" onClick={start}>
              <CircleDot size={18} />
              {scenario.readyCta}
            </button>
          </div>
        )}

        {phase === 'setup' && (
          <div className="timeline-banner">
            <span>ORIGINAL TIMELINE PLAYING</span>
            <strong>{scenario.setupLabel}</strong>
          </div>
        )}

        {phase === 'choose' && (
          <div className="penalty-card energy-card">
            <span>REALITY PAUSED</span>
            <h2>{scenario.choosePrompt}</h2>
            <div className="energy-grid">
              {(Object.keys(scenario.energyCopy) as TimelineEnergy[]).map((key) => (
                <button key={key} type="button" className={`energy-choice energy-${key}`} onClick={() => choose(key)}>
                  <em>{scenario.energyCopy[key].kicker}</em>
                  <strong>{scenario.energyCopy[key].title}</strong>
                  <small>{scenario.energyCopy[key].description}</small>
                  <i aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'timing' && (
          <button type="button" className={`kick-zone timing-${energy ?? 'normal'}`} onClick={kick}>
            <div className="kick-meta">
              <span>{scenario.timingCta}</span>
              {energy && <strong>{scenario.energyCopy[energy].title} timeline armed</strong>}
            </div>
            <div className="timing-track">
              <em className="bad-zone left-zone">EARLY</em>
              <i style={{ left: `${meter * 100}%` }} />
              <b />
              <em className="bad-zone right-zone">LATE</em>
            </div>
            <div className="kick-feedback">
              <small>{meterScore < 0.08 ? 'Perfect strike window' : meterScore < 0.18 ? 'Good contact' : 'Hold nerve'}</small>
              <small>{Math.round((1 - Math.min(1, meterScore * 2)) * 100)}% control</small>
            </div>
          </button>
        )}

        {outcome && (
          <>
            <ActionShock outcome={outcome} />
            <TimelineAtmosphere outcome={outcome} />
            <RealisticBallFlight outcome={outcome} ballStart={scenario.markers.ballStart} />
            <TimelineSplit outcome={outcome} ballStart={scenario.markers.ballStart} />
            <GoalImpact outcome={outcome} />
          </>
        )}

        {outcome?.effect === 'portal' && <div className="var-portal">VAR PORTAL</div>}

        {phase === 'result' && outcome && (
          <div className="result-slab">
            <span>{timelineId} - {outcome.rarity} - {outcome.odds}</span>
            <h2>{outcome.label}</h2>
            <p>{outcome.caption}</p>
            <div className="timeline-beats" aria-label="Timeline beats">
              {outcome.beats.map((beat) => (
                <small key={beat}>{beat}</small>
              ))}
            </div>
            <div className="result-actions">
              <button type="button" onClick={start}>
                <RotateCcw size={16} />
                New timeline
              </button>
              <button type="button" onClick={() => void saveShareClip(outcome)} disabled={exportingClip}>
                <Video size={16} />
                {exportingClip ? 'Making clip' : 'Save clip'}
              </button>
              <button type="button" onClick={() => void captureTimeline(scenario, outcome, timelineId)}>
                <Camera size={16} />
                Share link
              </button>
            </div>
          </div>
        )}

        <div className="news-strip">
          <Sparkles size={15} />
          <span>2 sec setup - 3 sec interaction - 3 sec alternate result</span>
          <Zap size={15} />
        </div>
      </section>
    </main>
  )
}
