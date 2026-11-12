import DeviceCard, { Readings } from './DeviceCard'
import StatusBadge from './StatusBadge'
import { reading, alarmState } from './format'
const output = value => value == null ? '—' : value ? 'ON' : 'OFF'
const health = value => value == null ? 'NO DATA' : value ? 'ONLINE' : 'OFFLINE'
export default function ClimateZoneCard({ device }) {
  return <DeviceCard device={device} category="Climate zone">
    <div className="pa-primary"><span>Temperature</span><strong>{reading(device.temperatureF, '°F')}</strong><StatusBadge status={!device.mode || device.mode === 'NO_DATA' ? 'NO DATA' : device.mode} /></div>
    <Readings rows={[
      ['Setpoint', reading(device.setpointF, '°F')], ['Humidity', reading(device.humidityPercent, '%')],
      ['Heating feedback', output(device.heatingActive)], ['Cooling feedback', output(device.coolingActive)], ['Fan feedback', output(device.fanActive)],
      ['Sensor', health(device.sensorOnline)], ['Controller', health(device.controllerOnline)],
      ['Alarm', <StatusBadge status={alarmState(device.alarm)} />],
    ]} />
    {device.updatedAt && <p className="pa-muted" style={{overflowWrap:'anywhere'}}>Sample: {device.updatedAt}</p>}
  </DeviceCard>
}
