import { PA_MACHINE_CONFIG } from './machineConfig.js'
import { PA_CLIMATE_ZONE_CONFIG } from './climateConfig.js'
export { PA_MACHINE_CONFIG } from './machineConfig.js'
export { PA_CLIMATE_ZONE_CONFIG } from './climateConfig.js'
// Inventory only: null telemetry and alarms mean unavailable, never zero/healthy.
// Future adapters supply telemetry in the units used by the presentation components.
const inventory = (kind, count) => Array.from({ length: count }, (_, index) => ({
  id: `pa-${kind.toLowerCase()}-${index + 1}`, name: `${kind} ${index + 1}`,
  connection: 'NOT CONFIGURED', telemetry: null,
}))
export const PA_CHILLER_CONFIG = []
export const PA_BARREL_CONFIG = inventory('Barrel', 4)
// Single source of assignments, independent of array positions.
export const PA_MIXER_CONFIG = inventory('Mixer', 3).map(device => ({ ...device, barrelId: null }))
export const PA_PLANT = {
  controllers: null, chillers: PA_CHILLER_CONFIG, barrels: PA_BARREL_CONFIG,
  mixers: PA_MIXER_CONFIG, machines: PA_MACHINE_CONFIG,
  climateZones: PA_CLIMATE_ZONE_CONFIG, alarms: null,
}
