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
  {
    id: 'breakaway-finish',
    title: 'Rewrite the breakaway finish.',
    eyebrow: 'PLAYABLE MATCH MOMENT',
    description: 'Real broadcast footage. One touch before the finish, choose how this attack becomes history.',
    template: 'breakaway-finish',
    baseVideo: 'footage/messi-breakaway.mp4',
    decisionTime: 2.18,
    setupLabel: 'The final shooting lane is opening',
    readyCta: 'Enter the attack',
    choosePrompt: 'How do you finish the breakaway?',
    timingCta: 'Strike now',
    resultShareTitle: 'Breakaway Timeline',
    stageAspect: '16 / 9',
    hotspotLabels: ['NEAR', 'HIGH', 'FAR'],
    markers: {
      ballStart: { x: 34.5, y: 56 },
      goal: { x: 82, y: 24, width: 17.5, height: 31 },
    },
    energyCopy: {
      normal: { title: 'Composed', kicker: 'Place it', description: 'Read the keeper. Pick the corner.' },
      hero: { title: 'Thunderbolt', kicker: 'Power finish', description: 'Break the net. Own the replay.' },
      chaos: { title: 'Double shot', kicker: 'Split timeline', description: 'Two finishes leave the same boot.' },
      cursed: { title: 'Ghost curve', kicker: 'Impossible angle', description: 'Bend the ball through reality.' },
    },
  },
]

const DEFAULT_SCENARIO_ID = 'breakaway-finish'

export function getScenario(id?: string | null) {
  return (
    footballMomentScenarios.find((scenario) => scenario.id === id) ??
    footballMomentScenarios.find((scenario) => scenario.id === DEFAULT_SCENARIO_ID) ??
    footballMomentScenarios[0]
  )
}
