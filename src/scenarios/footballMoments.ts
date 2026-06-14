import type { PlayableMomentScenario } from '../engine/types'

export const footballMomentScenarios: PlayableMomentScenario[] = [
  {
    id: 'penalty-timeline-remix',
    title: 'Rewrite the penalty timeline.',
    eyebrow: 'PLAYABLE NEWS LAB',
    description: 'Real footage as the base layer. You choose the timeline energy, tap the kick, and the moment branches into a new reality.',
    template: 'spot-kick',
    baseVideo: 'footage/source-web.mp4',
    decisionTime: 3.05,
    setupLabel: 'Decision window incoming',
    readyCta: 'Start remix',
    choosePrompt: 'Pick the kind of timeline',
    timingCta: 'Tap to kick',
    resultShareTitle: 'Penalty Timeline Remix',
    markers: {
      ballStart: { x: 42.4, y: 70.8 },
      goal: { x: 27, y: 22, width: 46, height: 19 },
    },
    energyCopy: {
      normal: { title: 'Realistic', kicker: 'Normal match', description: 'Goal, save, post, miss.' },
      hero: { title: 'Cinematic', kicker: 'Highlight reel', description: 'Perfect finish, big emotion.' },
      chaos: { title: 'Absurd', kicker: 'Meme branch', description: 'Split-ball timeline.' },
      cursed: { title: 'Supernatural', kicker: 'Glitch branch', description: 'Reality breaks the rules.' },
    },
  },
]

export function getScenario(id?: string | null) {
  return footballMomentScenarios.find((scenario) => scenario.id === id) ?? footballMomentScenarios[0]
}
