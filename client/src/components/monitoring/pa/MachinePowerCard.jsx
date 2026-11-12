import DeviceCard, { Readings } from './DeviceCard'
import StatusBadge from './StatusBadge'
import { reading, state, alarmState } from './format'
export default function MachinePowerCard({ device }) {
  const t = device.telemetry ?? {}
  return <DeviceCard device={device} category="Machine power">
    <div className="pa-operation"><span>Electrical activity</span><StatusBadge status={t.status === 'NO_DATA' ? 'NO DATA' : state(t.status)} /></div>
    <div className="pa-phases" role="group" aria-label="Three-phase voltage">{['L1-L2', 'L2-L3', 'L3-L1'].map(phase => <div key={phase}><span>{phase}</span><strong>{reading(t.voltage?.[phase], 'V')}</strong><small>Voltage · V</small></div>)}</div>
    <div className="pa-phases" role="group" aria-label="Three-phase current">{['L1', 'L2', 'L3'].map(phase => <div key={phase}><span>{phase}</span><strong>{reading(t.current?.[phase], 'A')}</strong><small>Current · A</small></div>)}</div>
    <Readings rows={[
      ['Power', reading(t.kw, 'kW')], ['Power factor', reading(t.powerFactor)], ['Frequency', reading(t.frequencyHz, 'Hz')], ['Energy', reading(t.kwh, 'kWh')],
    ]} />
    {device.updatedAt && <p className="pa-muted">Sample: {device.updatedAt}</p>}
    <details className="pa-details"><summary>Additional measurements</summary><Readings rows={[
      ['Run feedback', t.runFeedback == null ? 'NO DATA' : t.runFeedback ? 'RUNNING' : 'STOPPED'],
      ['Apparent power', reading(t.kva, 'kVA')], ['Reactive power', reading(t.kvar, 'kvar')],
      ...['L1','L2','L3'].map(phase => [`${phase}-N voltage`, reading(t.voltageNeutral?.[phase], 'V')]),
      ['Neutral current', reading(t.currentNeutral, 'A')], ['Demand', reading(t.demandKw, 'kW')],
      ['Runtime', reading(t.runtimeHours, 'h')], ['Start count', reading(t.startCount)],
    ]} /></details>
    <details className="pa-details"><summary>Electrical alarms</summary><Readings rows={[
      ['Phase loss', <StatusBadge status={alarmState(t.phaseLoss)} />], ['Undervoltage', <StatusBadge status={alarmState(t.undervoltage)} />],
      ['Overvoltage', <StatusBadge status={alarmState(t.overvoltage)} />], ['Phase imbalance', <StatusBadge status={alarmState(t.phaseImbalance)} />], ['Overcurrent', <StatusBadge status={alarmState(t.overcurrent)} />],
      ['Phase sequence', <StatusBadge status={alarmState(t.phaseSequence)} />], ['Meter fault', <StatusBadge status={alarmState(t.meterFault)} />],
    ]} /></details>
  </DeviceCard>
}
