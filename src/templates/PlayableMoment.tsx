import type { PlayableMomentScenario } from '../engine/types'
import { getScenario } from '../scenarios/footballMoments'
import { BreakawayFinishTemplate } from './BreakawayFinishTemplate'
import { SpotKickTemplate } from './SpotKickTemplate'

type PlayableMomentProps = {
  scenario?: PlayableMomentScenario
}

export function PlayableMoment({ scenario = getScenario() }: PlayableMomentProps) {
  switch (scenario.template) {
    case 'breakaway-finish':
      return <BreakawayFinishTemplate scenario={scenario} />
    case 'spot-kick':
      return <SpotKickTemplate scenario={scenario} />
    default:
      return <SpotKickTemplate scenario={scenario} />
  }
}
