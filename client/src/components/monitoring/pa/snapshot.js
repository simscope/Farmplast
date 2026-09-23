import { PA_PLANT } from './config.js'

// Proposed v1 contract; no query, timers, registration, or production fixture.
export const PA_CABINET_KEY = 'ESP32-PA-BARREL-MIXER-01'
export const PA_STALE_MS = 45000
const number = (value, min = -Infinity, max = Infinity) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
const bool = value => typeof value === 'boolean' ? value : null
const choice = (value, options) => options.includes(value) ? value : null
const integer = value => Number.isSafeInteger(value) && value >= 0
const exactSlots = (rows, configs) => Array.isArray(rows) && rows.length === configs.length &&
  configs.every(config => rows.filter(row => row?.id === config.id).length === 1)

export function validSnapshot(snapshot) {
  return Boolean(snapshot && snapshot.schema_version === 1 && snapshot.device_key === PA_CABINET_KEY &&
    typeof snapshot.boot_id === 'string' && snapshot.boot_id.length > 0 && snapshot.boot_id.length <= 64 &&
    integer(snapshot.sequence) && integer(snapshot.uptime_sec) &&
    ['LIVE', 'TEST'].includes(snapshot.source_mode) &&
    exactSlots(snapshot.barrels, PA_PLANT.barrels) && exactSlots(snapshot.mixers, PA_PLANT.mixers))
}

// updated_at is the backend-owned timestamp of a newly accepted snapshot.
// Stale/test/invalid envelopes never expose operational readings or current alarms.
export function adaptPaSnapshot(snapshot, { now = Date.now(), configured = false } = {}) {
  const valid = validSnapshot(snapshot)
  const timestamp = valid && typeof snapshot.updated_at === 'string' ? Date.parse(snapshot.updated_at) : NaN
  const age = now - timestamp
  const connection = !snapshot && !configured ? 'NOT CONFIGURED'
    : !valid || !Number.isFinite(age) || age < 0 ? 'NO DATA'
      : age >= PA_STALE_MS ? 'STALE' : snapshot.source_mode === 'TEST' ? 'TEST MODE' : 'ONLINE'
  const live = connection === 'ONLINE'
  const alarms = []
  const addAlarm = (device, field, severity, message) => alarms.push({
    id: `${device.id}-${field}`, deviceName: device.name, severity, message,
  })
  const barrels = PA_PLANT.barrels.map(device => {
    const row = live ? snapshot.barrels.find(row => row.id === device.id) : {}
    const sensorStatus = choice(row.sensor_status, ['ONLINE', 'OFFLINE', 'NO DATA', 'NOT CONFIGURED'])
    const measurable = live && sensorStatus === 'ONLINE'
    const low = bool(row.low_level_alarm)
    const high = bool(row.high_level_alarm)
    const sensorError = typeof row.sensor_error === 'string' && row.sensor_error.trim() ? row.sensor_error : null
    if (sensorError) addAlarm(device, 'sensor', 'WARNING', `Sensor error: ${sensorError}`)
    if (low === true) addAlarm(device, 'low', 'WARNING', 'Low-level alarm')
    if (high === true) addAlarm(device, 'high', 'WARNING', 'High-level alarm')
    return { ...device, connection, updatedAt: Number.isFinite(timestamp) ? snapshot.updated_at : null,
      telemetry: {
        levelPercent: measurable ? number(row.level_percent, 0, 100) : null,
        rawValue: measurable ? number(row.raw_value) : null,
        distance: measurable ? number(row.distance_mm, 0) : null,
        sensorTemperature: measurable ? number(row.sensor_temperature_f) : null,
        snr: measurable ? number(row.snr_db) : null,
        sensorStatus, error: sensorError, lowLevelWarning: low, highLevelWarning: high,
      },
    }
  })
  const mixers = PA_PLANT.mixers.map(device => {
    const row = live ? snapshot.mixers.find(row => row.id === device.id) : {}
    const running = bool(row.run_feedback)
    const fault = bool(row.fault)
    const overload = bool(row.overload)
    if (fault === true) addAlarm(device, 'fault', 'CRITICAL', 'Mixer fault')
    if (overload === true) addAlarm(device, 'overload', 'CRITICAL', 'Mixer overload')
    return { ...device, connection, updatedAt: Number.isFinite(timestamp) ? snapshot.updated_at : null,
      barrelId: PA_PLANT.barrels.some(barrel => barrel.id === row.assigned_barrel_id) ? row.assigned_barrel_id : null,
      telemetry: {
        operation: running === null ? null : running ? 'RUNNING' : 'STOPPED',
        commandedState: choice(row.commanded_state, ['START', 'STOP']),
        mode: choice(row.mode, ['AUTO', 'MANUAL']), current: number(row.current_a, 0),
        overload, fault: fault === true || overload === true ? true : fault === false && overload === false ? false : null,
        faultFeedback: fault, runtimeHours: number(row.runtime_sec, 0) === null ? null : row.runtime_sec / 3600,
      },
    }
  })
  const runningKnown = mixers.every(device => device.telemetry.operation !== null)
  return { ...PA_PLANT, barrels, mixers,
    controllers: valid ? [{ id: PA_CABINET_KEY, connection }] : null,
    cabinetConnection: connection,
    mixerSummary: runningKnown ? `${mixers.filter(device => device.telemetry.operation === 'RUNNING').length} / ${mixers.length} RUNNING` : null,
    // No records does not establish absence of alarms unless coverage is explicit.
    alarms: live && (alarms.length || snapshot.alarm_data_complete === true) ? alarms : null,
  }
}
