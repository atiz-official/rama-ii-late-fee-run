import { AlertTriangle, CheckCircle2, Circle, Coffee, Gauge, Map, Play, Timer, Volume2, VolumeX } from 'lucide-react'
import { RUN_SECONDS, useGameStore } from '../game/store'

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function Hud() {
  const {
    timeLeft,
    stress,
    status,
    stage,
    speed,
    distance,
    score,
    combo,
    collisions,
    message,
    routePhase,
    cleanStreak,
    hasChild,
    objectives,
    bestScore,
    soundEnabled,
    start,
    toggleSound,
  } = useGameStore()
  const markerPosition = Math.max(8, Math.min(92, distance * 100))
  const mood = Math.max(0, 100 - Math.round(stress))
  const cruiseTime = RUN_SECONDS - timeLeft
  const objectiveRows =
    stage === 'nursery'
      ? ([
          ['reachNursery', 'Enter the scenic cafe', objectives.reachNursery],
          ['grabChild', 'Order two good coffees', objectives.grabChild],
          ['escapeNursery', 'Return to the car', objectives.escapeNursery],
        ] as const)
      : ([
          ['survive', 'Cruise Thong Lor calmly', objectives.survive],
          ['dodgeConcrete', 'Spot a cafe worth considering', objectives.dodgeConcrete],
          ['exitReady', 'Compare the street vibe', objectives.exitReady],
          ['reachNursery', 'Arrive at a scenic cafe area', objectives.reachNursery],
          ['grabChild', 'Slow down and park when it feels right', objectives.grabChild],
        ] as const)

  return (
    <section className="hud-layer" aria-label="Game status">
      <div className="mission-panel glass-panel">
        <div className="panel-title">
          <AlertTriangle size={15} />
          MAIN MISSION
        </div>
        <h1>{stage === 'nursery' ? 'Cafe Stop' : 'Scenic Cafe Cruise'}</h1>
        <ul>
          {objectiveRows.map((row) => (
            <li key={row[0]} className={row[2] ? 'objective-complete' : ''}>
              {row[2] ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              <span>{row[1]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="new-mission glass-panel">
        <span>{stage === 'nursery' ? 'FINAL STOP FOUND' : 'SCENIC DRIVE MODE'}</span>
        <strong>{stage === 'nursery' ? 'Order the coffee and enjoy the view' : 'Cruise Thong Lor and choose a cafe with the right vibe'}</strong>
      </div>

      <div className="timer-panel glass-panel">
        <div>
          <span className="small-label">
            <Timer size={14} />
            CRUISE TIME
          </span>
          <strong>{formatTime(cruiseTime)}</strong>
        </div>
        <div>
          <span className="small-label">COFFEE PLAN</span>
          <strong>&#3647;500 / 2 CUPS</strong>
        </div>
      </div>

      <div className="minimap glass-panel">
        <div className="panel-title">
          <Map size={15} />
          {stage === 'nursery' ? 'CAFE FLOORPLAN' : 'THONG LOR CAFE MAP'}
        </div>
        <div className="map-road">
          <span style={{ left: `${markerPosition}%` }} className="taxi-dot" />
          <span className="finish-dot">
            <Coffee size={14} />
          </span>
        </div>
        <div className="map-meta">
          <span>{stage === 'nursery' ? (hasChild ? 'coffee secured' : 'find table') : `${Math.round(speed * 2.6)} km/h`}</span>
          <span>
            scenic route
          </span>
        </div>
      </div>

      <div className="drive-readout glass-panel">
        <span>{routePhase}</span>
        <strong>{score.toLocaleString()} pts</strong>
        <small>
          {message} &middot; vibe {combo.toFixed(2)}x &middot; smooth {cleanStreak.toFixed(1)}s &middot; {collisions} brushes
        </small>
      </div>

      {stage === 'nursery' && status === 'running' && (
        <div className="meme-caption">
          <strong>{hasChild ? 'Coffee date secured' : 'Walking into the cafe before the queue'}</strong>
        </div>
      )}

      <div className="stress-wrap">
        <div className="stress-label">
          <span>
            <Gauge size={16} />
            CAFE MOOD
          </span>
          <strong>{mood}%</strong>
        </div>
        <div className="stress-track">
          <span style={{ width: `${mood}%` }} />
        </div>
      </div>

      {status !== 'running' && status !== 'ready' && (
        <div className={`end-state ${status}`}>
          <div className="end-card glass-panel">
            <span>{status === 'won' ? 'CAFE CHOSEN' : 'CRUISE RESET'}</span>
            <h2>{status === 'won' ? 'Good coffee secured.' : 'The vibe got too tense.'}</h2>
            <p>
              {status === 'won'
                ? `Score ${score.toLocaleString()} - ${collisions} brushes - ${formatTime(cruiseTime)} cruise.`
                : `Score ${score.toLocaleString()} - ${collisions} brushes - best ${bestScore.toLocaleString()}.`}
            </p>
            <button type="button" onClick={start}>
              Run it again
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="start-state">
          <div className="start-card glass-panel">
            <span>THONG LOR: CAFE RUN</span>
            <h2>Cruise for good coffee.</h2>
            <p>Sunny Sukhumvit. A glacier-blue EV. Condos, cafes, bikes, brake lights, and a relaxed search for the cafe that feels right. Smooth driving builds mood.</p>
            <div className="start-actions">
              <button type="button" onClick={start}>
                <Play size={18} />
                Start cruise
              </button>
              <button type="button" onClick={toggleSound}>
                {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                {soundEnabled ? 'Sound on' : 'Sound off'}
              </button>
            </div>
            <small>WASD / arrows drive - Space brakes - slow down near a cafe to stop - R restarts</small>
          </div>
        </div>
      )}
    </section>
  )
}
