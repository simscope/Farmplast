import DeviceCard, { Readings } from './DeviceCard'
import StatusBadge from './StatusBadge'
import { reading, state, alarmState } from './format'
export default function MixerStatus({ device, barrels = [] }) {
  const t = device.telemetry ?? {}
  return <DeviceCard device={device} category="Mixer"><Readings rows={[
    ['Operation', <StatusBadge status={state(t.operation)} />], ['Mode', state(t.mode)], ['Current', reading(t.current, 'A')],
    ['Overload / fault', <StatusBadge status={alarmState(t.fault)} />], ['Runtime', reading(t.runtimeHours, 'h')],
    ['Assigned barrel', barrels.find(barrel => barrel.id === device.barrelId)?.name || 'Not assigned'],
  ]} /></DeviceCard>
}
