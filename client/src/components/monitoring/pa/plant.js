import { adaptPaSnapshot } from './snapshot'
import { adaptMachineSnapshot } from './machineSnapshot'
import { adaptClimateSnapshot, withClimateState } from './climateSnapshot'

// Shared unconfigured state until PA telemetry is connected.
export function getPaPlant() {
  return withClimateState(
    { ...adaptPaSnapshot(null), machines: adaptMachineSnapshot(null) },
    adaptClimateSnapshot(null),
  )
}
