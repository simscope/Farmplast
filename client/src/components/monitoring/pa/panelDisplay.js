// Display-only translation of JC8012P4A1_HMI/ui.cpp stateColor/stateText.
// These level bands are panel presentation, not cloud alarm thresholds.
export function siloDisplay(device) {
  const t = device.telemetry || {}
  const live = device.connection === 'ONLINE' && t.sensorStatus === 'ONLINE'
  const level = live && Number.isFinite(t.levelPercent) && t.levelPercent >= 0 && t.levelPercent <= 100 ? t.levelPercent : null
  let color = '#6F7782'
  let status = device.connection === 'ONLINE' ? t.sensorStatus === 'OFFLINE' ? 'OFFLINE' : 'NO DATA' : device.connection || 'NO DATA'
  if (level !== null) {
    color = level <= 20 ? '#E0B223' : level <= 80 ? '#2E8B57' : '#C2412D'
    status = level <= 20 ? 'LOW' : level <= 80 ? 'NORMAL' : 'HIGH / FULL'
  }
  return { level, color, status, raw: live && Number.isFinite(t.rawValue) ? t.rawValue : '—',
    alarm: device.connection === 'ONLINE' && (t.error || t.lowLevelWarning === true || t.highLevelWarning === true) ? 'ALARM' : null }
}

export function mixerDisplay(device) {
  const t = device.connection === 'ONLINE' ? device.telemetry || {} : {}
  return { status: t.operation || 'NO DATA', mode: t.mode || null,
    alarm: t.fault === true ? 'FAULT' : t.fault === false ? 'NONE' : '—',
    assigned: device.connection === 'ONLINE' ? device.barrelId : null }
}
