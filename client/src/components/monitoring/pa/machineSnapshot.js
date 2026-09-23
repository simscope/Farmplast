import { PA_MACHINE_CONFIG } from './machineConfig.js'

export const PA_POWER_GATEWAY_KEY = 'ESP32-PA-MACHINE-POWER-01'
export const PA_POWER_STALE_MS = 45000
const numeric = (v, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null
const boolean = v => typeof v === 'boolean' ? v : null
const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN
const integer = value => Number.isSafeInteger(value) && value >= 0
const alarmFields = {
  phaseLoss: 'phase_loss', undervoltage: 'undervoltage', overvoltage: 'overvoltage',
  phaseImbalance: 'voltage_imbalance', overcurrent: 'overcurrent',
  phaseSequence: 'phase_sequence', meterFault: 'meter_fault',
}

// Pure boundary adapter. No transport, timer, threshold detector, or control code.
export function adaptMachineSnapshot(snapshot, { config = PA_MACHINE_CONFIG, now = Date.now(), configured = false } = {}) {
  const ids = config.map(device => device.id)
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Machine configuration requires unique nonempty IDs')
  }
  const valid = snapshot?.schema_version === 1 && snapshot.device_key === PA_POWER_GATEWAY_KEY &&
    typeof snapshot.boot_id === 'string' && snapshot.boot_id.length > 0 && snapshot.boot_id.length <= 64 &&
    integer(snapshot.sequence) && ['LIVE', 'TEST'].includes(snapshot.source_mode) && Array.isArray(snapshot.machines)
  const gatewayTime = valid ? timestamp(snapshot.updated_at) : NaN
  return config.filter(device => device.enabled === true).map(device => {
    const matches = valid ? snapshot.machines.filter(row => row?.id === device.id) : []
    const row = matches.length === 1 ? matches[0] : null
    const sampleTime = timestamp(row?.updated_at)
    let connection = 'NO DATA'
    if (!snapshot && !configured) connection = 'NOT CONFIGURED'
    else if (row && Number.isFinite(gatewayTime) && Number.isFinite(sampleTime) &&
      gatewayTime <= now && sampleTime <= gatewayTime) {
      connection = now - gatewayTime >= PA_POWER_STALE_MS || now - sampleTime >= PA_POWER_STALE_MS
        ? 'STALE' : snapshot.source_mode === 'TEST' ? 'TEST MODE' : 'ONLINE'
    }
    const live = connection === 'ONLINE'
    const t = live ? row : {}
    const alarms = Object.fromEntries(Object.entries(alarmFields).map(([key, source]) => [key, boolean(t.alarms?.[source])]))
    const lastReportedAlarms = Object.fromEntries(Object.entries(alarmFields).map(([key, source]) => [key, boolean(row?.alarms?.[source])]))
    const electricalActivity = ['OFF', 'ACTIVE'].includes(t.electrical_activity) ? t.electrical_activity : null
    const runFeedback = boolean(t.run_feedback)
    const status = Object.values(alarms).some(v => v === true) ? 'ALARM' : electricalActivity ?? 'NO_DATA'
    return { id: device.id, name: device.name, enabled: true, connection,
      updatedAt: Number.isFinite(sampleTime) ? row.updated_at : null,
      gatewayUpdatedAt: Number.isFinite(gatewayTime) ? snapshot.updated_at : null,
      lastReportedAlarms, // historical/provenance only; never current UI alarms
      telemetry: {
        status, electricalActivity, runFeedback,
        voltage: Object.fromEntries(['L1-L2', 'L2-L3', 'L3-L1'].map((key, i) => [key, numeric(t.voltage?.[['l1_l2','l2_l3','l3_l1'][i]], 0)])),
        current: Object.fromEntries(['L1', 'L2', 'L3'].map((key, i) => [key, numeric(t.current?.[['l1','l2','l3'][i]], 0)])),
        kw: numeric(t.power?.kw), kva: numeric(t.power?.kva, 0), kvar: numeric(t.power?.kvar),
        powerFactor: numeric(t.power?.pf, -1, 1), frequencyHz: numeric(t.power?.hz, 0), kwh: numeric(t.energy_kwh, 0),
        voltageNeutral: Object.fromEntries(['L1','L2','L3'].map((key, i) => [key, numeric(t.voltage?.[['l1_n','l2_n','l3_n'][i]], 0)])),
        currentNeutral: numeric(t.current?.neutral, 0), demandKw: numeric(t.demand_kw, 0),
        runtimeHours: numeric(t.runtime_sec, 0) === null ? null : t.runtime_sec / 3600,
        startCount: integer(t.start_count) ? t.start_count : null,
        ...alarms,
      },
    }
  })
}
