import { Bell } from 'lucide-react'
import StatusBadge from './StatusBadge'
// null = unconfigured source; [] = configured source reporting no active alarms.
// Records: { id, severity: 'CRITICAL' | 'WARNING' | 'INFO', message, deviceName? }.
export default function AlarmSummary({ alarms = null }) {
  if (!alarms?.length) return null
  return <section className="pa-alarms" aria-labelledby="pa-alarms-title">
    <div className="pa-alarm-heading"><Bell size={20} aria-hidden="true" /><h2 id="pa-alarms-title">Active Alarms</h2><StatusBadge status={alarms === null ? 'NOT CONFIGURED' : `${alarms.length} ACTIVE`} /></div>
    {alarms?.length ? <ul>{alarms.map(alarm => <li key={alarm.id}><StatusBadge status={alarm.severity} /><span>{alarm.deviceName && `${alarm.deviceName}: `}{alarm.message}</span></li>)}</ul>
      : <p className="pa-muted">{alarms === null ? 'Alarm monitoring not configured' : 'No active alarms'}</p>}
  </section>
}
