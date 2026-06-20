export type ClipPhase = 'ready' | 'setup' | 'choose' | 'timing' | 'result'

export type TimelineEnergy = 'normal' | 'hero' | 'chaos' | 'cursed'

export type MomentTemplateId = 'spot-kick' | 'breakaway-finish'
export type KeeperReactionId = 'wrong-footed' | 'fist-pump' | 'sprawl-save' | 'stunned-freeze' | 'mocking-dance'
export type PlayerReactionId = 'arms-wide' | 'knees-slide' | 'face-cover' | 'cold-stare' | 'crowd-sprint'
export type CrowdBedId = 'roar' | 'gasp' | 'silence' | 'post-clang' | 'chaos-surge' | 'var-confusion' | 'hero-chant' | 'stunned-laughter'
export type CommentaryStyleId = 'thai-chaos' | 'english-drama' | 'dead-air' | 'var-room' | 'meme-table'
export type CameraTreatmentId = 'broadcast' | 'slowmo-punch' | 'handheld-chaos' | 'freeze-frame' | 'var-glitch'
export type RarityTier = 'common' | 'rare' | 'legendary' | 'absurd' | 'cursed' | 'tragic'

export type TimelineOutcome = {
  id: string
  label: string
  caption: string
  rarity: string
  rarityTier: RarityTier
  odds: string
  target: { x: number; y: number }
  ballColor: string
  keeperDive: 'left' | 'right' | 'center' | 'hold'
  keeperReaction: KeeperReactionId
  playerReaction: PlayerReactionId
  crowdBed: CrowdBedId
  commentaryStyle: CommentaryStyleId
  cameraTreatment: CameraTreatmentId
  commentatorLine: string
  crowdSign: string
  beats: string[]
  flight: 'driven' | 'rising' | 'curl' | 'sky' | 'panenka' | 'portal'
  impact: 'net' | 'save' | 'post' | 'miss' | 'portal'
  curve: number
  spin: number
  effect: 'clean' | 'save' | 'post' | 'sky' | 'fan' | 'portal' | 'multi'
}

export type TimelineEnergyCopy = {
  title: string
  kicker: string
  description: string
}

export type MomentMarkers = {
  ballStart: { x: number; y: number }
  goal: { x: number; y: number; width: number; height: number }
}

export type PlayableMomentScenario = {
  id: string
  slug: string
  title: string
  eyebrow: string
  description: string
  template: MomentTemplateId
  baseVideo: string
  decisionTime: number
  setupLabel: string
  readyCta: string
  choosePrompt: string
  timingCta: string
  resultShareTitle: string
  poster: string
  catalogLabel: string
  durationLabel: string
  stageAspect?: string
  hotspotLabels?: [string, string, string]
  markers: MomentMarkers
  energyCopy: Record<TimelineEnergy, TimelineEnergyCopy>
}
