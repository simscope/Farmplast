import DeviceCard, { Readings } from './DeviceCard'
import StatusBadge from './StatusBadge'
import { reading, state, warningState } from './format'
export default function BarrelCard({ device, mixers = [] }) {
  const t = device.telemetry ?? {}
  const assigned = mixers.filter(mixer => mixer.barrelId === device.id).map(mixer => mixer.name).join(', ')
  return <DeviceCard device={device} category="Material storage">
    <div className="pa-primary"><span>Level</span><strong>{reading(t.levelPercent, '%')}</strong><StatusBadge status={state(t.sensorStatus)} /></div>
    <Readings rows={[
      ['Distance', reading(t.distance, 'mm')], ['Sensor temperature', reading(t.sensorTemperature, '°F')],
      ['SNR', reading(t.snr, 'dB')], ['Error', state(t.error)], ['Assigned mixer', assigned || 'Not assigned'],
      ['Low-level warning', <StatusBadge status={warningState(t.lowLevelWarning)} />], ['High-level warning', <StatusBadge status={warningState(t.highLevelWarning)} />],
    ]} />
  </DeviceCard>
}
