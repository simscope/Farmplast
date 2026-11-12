import DeviceCard, { Readings } from './DeviceCard'
import StatusBadge from './StatusBadge'
import { reading, state, alarmState } from './format'
export default function ChillerCard({ device }) {
  const t = device.telemetry ?? {}
  return <DeviceCard device={device} category="Chiller"><Readings rows={[
    ['Operation', <StatusBadge status={state(t.operation)} />],
    ['Chilled water IN', reading(t.chilledWaterIn, '°F')], ['Chilled water OUT', reading(t.chilledWaterOut, '°F')],
    ['Condenser water IN', reading(t.condenserWaterIn, '°F')], ['Condenser water OUT', reading(t.condenserWaterOut, '°F')],
    ['Setpoint', reading(t.setpoint, '°F')], ['Compressor count', reading(t.compressorCount)],
    ['Compressor status', state(t.compressorStatus)], ['Alarm', <StatusBadge status={alarmState(t.alarm)} />],
  ]} />{t.compressors?.length > 0 && <Readings rows={t.compressors.map(compressor => [compressor.name, <StatusBadge status={state(compressor.status)} />])} />}</DeviceCard>
}
