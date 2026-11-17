// Synthetic readings used only by tests. Never loaded into the MSI service.
import { ASSETS, RAW_REGISTERS } from './state.mjs'
import points from './points.json' with { type: 'json' }
export function plc(n = 2, rawValue = 500) {
  return { payload: { device_code: `ESP32-CH${n}-PLC`, readings: [
    ...RAW_REGISTERS.map(reg => ({ point_code: `CH2_R${reg}`, value_number: rawValue })),
    ...['SYSTEM_RUNNING', 'COMP_1A_ENABLED', 'COMP_1B_ENABLED', 'COMP_1C_ENABLED', 'COMP_2A_ENABLED', 'COMP_2B_ENABLED', 'COMP_2C_ENABLED'].map(bit => ({ point_code: `CH2_${bit}`, value_boolean: false })),
  ] } }
}
export function barrels(left = 0, right = 76) {
  return ASSETS.filter(a => a.producer === 'barrels').map((a, i) => ({ asset_id: a.asset_id, device_id: a.device_id, point_id: points.find(p => p.asset_id === a.asset_id && p.point_code.endsWith('_LEVEL_PERCENT')).point_id, value_number: i === 0 ? right : left }))
}
export function ch1() {
  const asset = ASSETS[0]
  return points.filter(p => p.asset_id === asset.asset_id).map(p => ({ asset_id: asset.asset_id, device_id: asset.device_id, point_id: p.point_id, ...(p.data_type === 'boolean' ? { value_boolean: p.point_code === 'CH1_ONLINE' } : { value_number: 50 }) }))
}
