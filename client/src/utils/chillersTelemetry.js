export const CHILLERS_POLL_MS = 10000
export const CHILLERS_COLUMNS = 'point_code,value_number,value_boolean,updated_at'

// This legacy page is currently unrouted. Keep its reader bounded if reused.
const displayedSuffixes = [
  'SETPOINT', 'CHW_IN', 'CHW_OUT', 'SUCTION_PRESSURE_C1', 'DISCHARGE_PRESSURE_C1',
  'RUNNING', 'SYSTEM_RUNNING', 'ALARM', 'ALARM_CRITICAL', 'ALARM_REFRIG',
  'DELTA_T', 'FLOW_C1', 'FLOW_C2', 'CAPACITY_C1', 'CAPACITY_C2', 'SYSTEM_DEMAND',
  'COMP_A_ENABLED', 'COMP_B_ENABLED', 'COMP_C_ENABLED',
]
export const CHILLERS_POINT_CODES = ['CH2', 'CH3'].flatMap(prefix =>
  displayedSuffixes.map(suffix => `${prefix}_${suffix}`))

export function loadChillersTelemetry(client, signal) {
  return client.from('v_asset_points_latest')
    .select(CHILLERS_COLUMNS)
    .in('point_code', CHILLERS_POINT_CODES)
    .order('point_code', { ascending: true })
    .abortSignal(signal)
}
