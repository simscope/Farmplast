import points from './points.json' with { type: 'json' }
const META_FIELDS = ['protocol','version','boot','job','status','progress','reset','failure_code','device','model','command_revision','reset_sequence']
const CONTROL = { CH1_AUTO:'auto', CH1_FAN_ENABLE:'fan_enable', CH1_FAN_30:'fan_30', CH1_FAN_60:'fan_60', CH1_SETPOINT:'setpoint', CH1_D1:'d1', CH1_D2:'d2', CH1_HYST:'hyst' }
export function gatewayFor(producer, body) {
  const rows = Array.isArray(body) ? body : body?.p_rows
  const raw = producer === 'chiller-1'
    ? rows?.find(r => r.point_id === '111996e4-ff83-4ad7-b4cd-233d326a30f7')?.raw_payload?.gateway
    : body?.payload?.gateway
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Gateway metadata required')
  const meta = Object.fromEntries(META_FIELDS.filter(k => Object.hasOwn(raw,k)).map(k => [k,raw[k]]))
  if (JSON.stringify(meta).length > 1024 || meta.protocol !== 2 || !/^[A-Za-z0-9._-]{1,48}$/.test(meta.version || '') || !/^[a-f0-9]{32}$/.test(meta.boot || '') || !/^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?$/.test(meta.job ?? '!') || !['idle','authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed','failed'].includes(meta.status) || !Number.isInteger(meta.progress) || meta.progress < 0 || meta.progress > 100) throw new Error('Invalid gateway metadata')
  return meta
}
export function controlReport(rows) {
  const report = {}
  for (const row of rows) {
    const p = points.find(p => p.point_id === row.point_id)
    const name = CONTROL[p?.point_code]
    if (name) report[name] = p.data_type === 'boolean' ? row.value_boolean : row.value_number
  }
  return report
}
