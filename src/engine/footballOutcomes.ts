import type { PlayableMomentScenario, TimelineEnergy, TimelineOutcome } from './types'
import { seeded } from './random'

export function pickFootballOutcome(scenario: PlayableMomentScenario, energy: TimelineEnergy, timing: number, seed: number): TimelineOutcome {
  switch (scenario.template) {
    case 'spot-kick':
      return pickSpotKickOutcome(energy, timing, seed)
    default:
      return pickSpotKickOutcome(energy, timing, seed)
  }
}

function pickSpotKickOutcome(energy: TimelineEnergy, timing: number, seed: number): TimelineOutcome {
  const rand = seeded(seed)
  const precision = 1 - Math.min(1, Math.abs(timing - 0.5) * 2)
  const luck = rand()
  const power = precision * 0.72 + luck * 0.28

  if (energy === 'chaos') {
    return {
      id: 'timeline-split',
      label: 'Timeline Split',
      caption: 'Two possible shots exist in the same second.',
      rarity: 'absurd',
      rarityTier: 'absurd',
      odds: '1.9%',
      target: { x: 42 + rand() * 18, y: 27 + rand() * 14 },
      ballColor: '#9affd0',
      keeperDive: luck > 0.62 ? 'left' : 'right',
      keeperReaction: 'stunned-freeze',
      playerReaction: 'cold-stare',
      crowdBed: 'chaos-surge',
      commentaryStyle: 'meme-table',
      cameraTreatment: 'handheld-chaos',
      commentatorLine: 'There are two timelines on the same kick! The stadium cannot agree what happened!',
      crowdSign: 'TWO TIMELINES?',
      beats: ['broadcast splits', 'second ball appears', 'crowd chooses a version'],
      flight: 'curl',
      impact: 'net',
      curve: (rand() - 0.5) * 20,
      spin: 950 + rand() * 520,
      effect: 'multi',
    }
  }

  if (energy === 'cursed' && luck > 0.28) {
    return {
      id: 'var-portal',
      label: 'VAR Portal',
      caption: 'The ball is under review in another dimension.',
      rarity: 'cursed',
      rarityTier: 'cursed',
      odds: '3.4%',
      target: { x: 50, y: 30 },
      ballColor: '#b88cff',
      keeperDive: 'center',
      keeperReaction: 'stunned-freeze',
      playerReaction: 'face-cover',
      crowdBed: 'var-confusion',
      commentaryStyle: 'var-room',
      cameraTreatment: 'var-glitch',
      commentatorLine: 'The ball has disappeared. VAR is checking which universe owns it.',
      crowdSign: 'VAR ATE MY GOAL',
      beats: ['ball enters review portal', 'crowd goes suspiciously quiet', 'screen tears open'],
      flight: 'portal',
      impact: 'portal',
      curve: (rand() - 0.5) * 10,
      spin: 1400,
      effect: 'portal',
    }
  }

  if (energy === 'hero' && power > 0.52) {
    return {
      id: 'top-bins',
      label: 'Top Bins',
      caption: 'Alternate timeline unlocked.',
      rarity: power > 0.86 ? 'legendary' : 'rare',
      rarityTier: power > 0.86 ? 'legendary' : 'rare',
      odds: power > 0.86 ? '4.2%' : '12.8%',
      target: { x: luck > 0.5 ? 69 : 31, y: 28 + rand() * 4 },
      ballColor: '#fff3a3',
      keeperDive: luck > 0.5 ? 'left' : 'right',
      keeperReaction: 'wrong-footed',
      playerReaction: power > 0.86 ? 'knees-slide' : 'arms-wide',
      crowdBed: 'hero-chant',
      commentaryStyle: 'english-drama',
      cameraTreatment: 'slowmo-punch',
      commentatorLine: 'Top corner! That is not a goal, that is a rewritten memory.',
      crowdSign: 'TIMELINE UNLOCKED',
      beats: ['keeper dives into the wrong story', 'ball kisses the top corner', 'player becomes poster art'],
      flight: 'curl',
      impact: 'net',
      curve: luck > 0.5 ? 16 + rand() * 8 : -16 - rand() * 8,
      spin: 1180 + rand() * 480,
      effect: 'clean',
    }
  }

  if (power > 0.67) {
    return {
      id: 'goal',
      label: 'Goal',
      caption: 'Different timeline. Same pressure.',
      rarity: 'clean',
      rarityTier: 'common',
      odds: '38.0%',
      target: { x: luck > 0.5 ? 63 : 37, y: 38 + rand() * 6 },
      ballColor: '#ffffff',
      keeperDive: luck > 0.5 ? 'left' : 'right',
      keeperReaction: 'wrong-footed',
      playerReaction: 'arms-wide',
      crowdBed: 'roar',
      commentaryStyle: 'thai-chaos',
      cameraTreatment: 'broadcast',
      commentatorLine: 'เข้าไปแล้ว! Clean timeline, no notes, pure pressure release!',
      crowdSign: 'WE BELIEVED',
      beats: ['keeper guesses late', 'net snaps back', 'crowd detonates'],
      flight: power > 0.78 ? 'rising' : 'driven',
      impact: 'net',
      curve: luck > 0.5 ? 7 + rand() * 6 : -7 - rand() * 6,
      spin: 980 + rand() * 420,
      effect: 'clean',
    }
  }

  if (power > 0.48) {
    return {
      id: 'post',
      label: 'Post',
      caption: 'One inch from rewriting the group chat.',
      rarity: 'painful',
      rarityTier: 'tragic',
      odds: '9.6%',
      target: { x: luck > 0.5 ? 73 : 27, y: 36 },
      ballColor: '#ffffff',
      keeperDive: luck > 0.5 ? 'left' : 'right',
      keeperReaction: 'stunned-freeze',
      playerReaction: 'face-cover',
      crowdBed: 'post-clang',
      commentaryStyle: 'dead-air',
      cameraTreatment: 'freeze-frame',
      commentatorLine: 'Off the post. The timeline was one inch wide.',
      crowdSign: 'NOOOOO',
      beats: ['post rings through the stadium', 'player folds into silence', 'crowd inhales at once'],
      flight: 'rising',
      impact: 'post',
      curve: luck > 0.5 ? 12 : -12,
      spin: 1260,
      effect: 'post',
    }
  }

  if (power > 0.26) {
    return {
      id: 'saved',
      label: 'Saved',
      caption: 'Keeper guessed your timeline.',
      rarity: 'canon-adjacent',
      rarityTier: 'rare',
      odds: '18.5%',
      target: { x: 50 + (luck - 0.5) * 18, y: 43 },
      ballColor: '#ffffff',
      keeperDive: luck > 0.56 ? 'right' : luck < 0.44 ? 'left' : 'center',
      keeperReaction: luck > 0.56 || luck < 0.44 ? 'sprawl-save' : 'fist-pump',
      playerReaction: 'face-cover',
      crowdBed: 'gasp',
      commentaryStyle: 'english-drama',
      cameraTreatment: 'slowmo-punch',
      commentatorLine: 'Saved! The keeper has read the future and slapped it away.',
      crowdSign: 'KEEPER MODE',
      beats: ['glove meets the shot', 'keeper punches the air', 'kicker hides his face'],
      flight: 'driven',
      impact: 'save',
      curve: (luck - 0.5) * 10,
      spin: 900,
      effect: 'save',
    }
  }

  return {
    id: 'sky',
    label: 'Row Z',
    caption: 'The moon has possession now.',
    rarity: 'tragic',
    rarityTier: 'tragic',
    odds: '16.2%',
    target: { x: 50 + (luck - 0.5) * 28, y: 8 },
    ballColor: '#ffffff',
    keeperDive: 'hold',
    keeperReaction: 'mocking-dance',
    playerReaction: 'face-cover',
    crowdBed: 'stunned-laughter',
    commentaryStyle: 'dead-air',
    cameraTreatment: 'freeze-frame',
    commentatorLine: 'That ball may need a visa to come back down.',
    crowdSign: 'ROW Z CLAIMS IT',
    beats: ['ball leaves the known world', 'keeper starts laughing', 'camera freezes on regret'],
    flight: 'sky',
    impact: 'miss',
    curve: (luck - 0.5) * 18,
    spin: 1500,
    effect: 'sky',
  }
}
