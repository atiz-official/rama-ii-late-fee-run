import { Check, Clapperboard, Play, X } from 'lucide-react'
import type { PlayableMomentScenario } from '../engine/types'

type ScenarioLibraryProps = {
  activeScenario: PlayableMomentScenario
  open: boolean
  scenarios: PlayableMomentScenario[]
  onClose: () => void
  onOpen: () => void
  onSelect: (scenario: PlayableMomentScenario) => void
}

export function ScenarioLibrary({ activeScenario, open, scenarios, onClose, onOpen, onSelect }: ScenarioLibraryProps) {
  return (
    <>
      <button type="button" className="scene-library-trigger" onClick={onOpen} aria-label="Choose playable moment">
        <Clapperboard size={17} />
        <span>Moments</span>
        <strong>{String(scenarios.length).padStart(2, '0')}</strong>
      </button>

      {open && (
        <div className="scene-library-backdrop" role="presentation" onMouseDown={onClose}>
          <section className="scene-library-panel" role="dialog" aria-modal="true" aria-label="Playable moments" onMouseDown={(event) => event.stopPropagation()}>
            <header className="scene-library-header">
              <div>
                <span>PLAYABLE FOOTBALL</span>
                <h2>Choose a moment</h2>
                <p>Enter the decision window. Rewrite what happens next.</p>
              </div>
              <button type="button" className="scene-library-close" onClick={onClose} aria-label="Close moment library">
                <X size={20} />
              </button>
            </header>

            <div className="scene-library-list">
              {scenarios.map((scenario, index) => {
                const active = scenario.id === activeScenario.id
                return (
                  <button
                    type="button"
                    className={`scene-library-item ${active ? 'is-active' : ''}`}
                    key={scenario.id}
                    onClick={() => onSelect(scenario)}
                  >
                    <span className="scene-library-poster">
                      <img src={`${import.meta.env.BASE_URL}${scenario.poster}`} alt="" />
                      <span className="scene-library-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="scene-library-play">{active ? <Check size={18} /> : <Play size={18} fill="currentColor" />}</span>
                    </span>
                    <span className="scene-library-copy">
                      <span className="scene-library-meta">
                        <em>{scenario.catalogLabel}</em>
                        <small>{scenario.durationLabel}</small>
                      </span>
                      <strong>{scenario.title}</strong>
                      <small>{scenario.description}</small>
                      <i>{active ? 'Now playing' : 'Play moment'}</i>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
