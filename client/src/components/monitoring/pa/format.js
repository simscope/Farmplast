export function reading(value, unit = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${unit ? ` ${unit}` : ''}` : '—'
}
export function state(value) {
  return value == null || value === '' ? 'NO DATA' : String(value)
}
export function alarmState(value) {
  return value == null ? 'NO DATA' : value ? 'ALARM' : 'NORMAL'
}
export function warningState(value) {
  return value == null ? 'NO DATA' : value ? 'WARNING' : 'NORMAL'
}
