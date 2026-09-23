import { PA_CLIMATE_ZONE_CONFIG } from './climateConfig.js'

export const PA_CLIMATE_KEY = 'ESP32-PA-CLIMATE-01'
export const PA_CLIMATE_STALE_MS = 180000
const numeric = (value, min = -Infinity, max = Infinity) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
const boolean = value => typeof value === 'boolean' ? value : null
const time = value => typeof value === 'string' ? Date.parse(value) : NaN
const mode = value => ['OFF', 'IDLE', 'HEAT', 'COOL', 'AUTO'].includes(value) ? value : 'NO_DATA'
const alarmDefinitions = {
  sensor_fault: ['sensorFault', 'WARNING', 'Sensor fault'],
  controller_offline: ['controllerOffline', 'WARNING', 'Controller offline'],
  high_temperature: ['highTemperature', 'WARNING', 'High temperature'],
  low_temperature: ['lowTemperature', 'WARNING', 'Low temperature'],
  high_humidity: ['highHumidity', 'WARNING', 'High humidity'],
  low_humidity: ['lowHumidity', 'WARNING', 'Low humidity'],
  hvac_output_fault: ['hvacOutputFault', 'CRITICAL', 'HVAC output fault'],
}

// Preparation only: no reads, publishing, control decisions, or inferred outputs.
export function adaptClimateSnapshot(snapshot, { config = PA_CLIMATE_ZONE_CONFIG, now = Date.now(), configured = false } = {}) {
  const ids = config.map(zone => zone.id)
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Climate configuration requires unique nonempty IDs')
  }
  const valid = snapshot?.schema_version === 1 && snapshot.device_key === PA_CLIMATE_KEY &&
    typeof snapshot.boot_id === 'string' && snapshot.boot_id.length > 0 && snapshot.boot_id.length <= 64 &&
    Number.isSafeInteger(snapshot.sequence) && snapshot.sequence >= 0 &&
    ['LIVE', 'TEST'].includes(snapshot.source_mode) && Array.isArray(snapshot.zones)
  const gatewayTime = valid ? time(snapshot.updated_at) : NaN
  const records = []
  const zones = config.filter(zone => zone.enabled === true).map(zone => {
    const matches = valid ? snapshot.zones.filter(row => row?.id === zone.id) : []
    const row = matches.length === 1 ? matches[0] : null
    const zoneTime = time(row?.updated_at)
    let connection = 'NO DATA'
    if (!snapshot && !configured) connection = 'NOT CONFIGURED'
    else if (row && Number.isFinite(gatewayTime) && Number.isFinite(zoneTime) && gatewayTime <= now && zoneTime <= gatewayTime) {
      connection = now - gatewayTime >= PA_CLIMATE_STALE_MS || now - zoneTime >= PA_CLIMATE_STALE_MS
        ? 'STALE' : snapshot.source_mode === 'TEST' ? 'TEST MODE' : 'ONLINE'
    }
    const live = connection === 'ONLINE'
    const data = live ? row : {}
    const sensorOnline = boolean(data.sensor_online)
    const controllerOnline = boolean(data.controller_online)
    const alarms = Object.fromEntries(Object.entries(alarmDefinitions).map(([raw, [key, severity, message]]) => {
      const active = boolean(data.alarms?.[raw])
      if (active === true) records.push({id:`${zone.id}-${raw}`, deviceName:zone.name, severity, message})
      return [key, active]
    }))
    const values = Object.values(alarms)
    const alarmCoverageKnown = live && data.alarm_data_complete === true
    const alarm = values.some(value => value === true) ? true : alarmCoverageKnown ? false : null
    return {id:zone.id, name:zone.name, enabled:true, connection,
      updatedAt:Number.isFinite(zoneTime) ? row.updated_at : null,
      gatewayUpdatedAt:Number.isFinite(gatewayTime) ? snapshot.updated_at : null,
      temperatureF:sensorOnline === false ? null : numeric(data.temperature_f),
      humidityPercent:sensorOnline === false ? null : numeric(data.humidity_percent, 0, 100),
      setpointF:controllerOnline === false ? null : numeric(data.setpoint_f),
      mode:controllerOnline === false ? 'NO_DATA' : mode(data.actual_mode),
      requestedMode:mode(data.requested_mode),
      heatingActive:controllerOnline === false ? null : boolean(data.outputs?.heating),
      coolingActive:controllerOnline === false ? null : boolean(data.outputs?.cooling),
      fanActive:controllerOnline === false ? null : boolean(data.outputs?.fan),
      sensorOnline, controllerOnline, alarms, alarm, alarmCoverageKnown,
    }
  })
  const healthKnown = zones.length > 0 && zones.every(zone => zone.connection === 'ONLINE' && zone.sensorOnline !== null && zone.controllerOnline !== null)
  const alarmCoverageKnown = zones.length > 0 && zones.every(zone => zone.alarmCoverageKnown)
  return { zones, alarmCoverageKnown,
    summary:healthKnown ? `${zones.filter(zone => zone.sensorOnline && zone.controllerOnline).length} / ${zones.length} ONLINE` : null,
    alarms:records.length || alarmCoverageKnown ? records : null,
  }
}

// Unknown sources cannot establish that the entire plant has no active alarms.
export function withClimateState(plant, climate) {
  const known = [...(plant.alarms ?? []), ...(climate.alarms ?? [])]
  return {...plant, climateZones:climate.zones, climateSummary:climate.summary,
    alarms:known.length || (Array.isArray(plant.alarms) && Array.isArray(climate.alarms)) ? known : null,
  }
}
