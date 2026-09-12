export function commandPatch(type, value) {
  if (type === 'fan_mode' && ['auto', 'manual'].includes(value)) return { auto: value === 'auto' }
  if (type === 'fan_off') return { auto: false, fan_enable: false, fan_30: false, fan_60: false }
  if (type === 'fan_speed' && [30, 60].includes(Number(value))) return { auto: false, fan_enable: true, fan_30: Number(value) === 30, fan_60: Number(value) === 60 }
  if (type === 'reset_alert') return { reset: true }
  if (['fan_setpoint', 'd1', 'd2', 'hyst'].includes(type) && value !== '' && Number.isFinite(Number(value))) {
    const number = Number(value)
    if (type === 'fan_setpoint' ? number >= -100 && number <= 300 : number >= 0 && number <= 100) return { [type === 'fan_setpoint' ? 'setpoint' : type]: number }
  }
  throw new Error('Invalid CH1 command or value')
}
