import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { siloDisplay, mixerDisplay } from './panelDisplay'
import StatusBadge from './StatusBadge'
import './barrelHmi.css'

function Silo({ device }) {
  const state = siloDisplay(device)
  const height = state.level === null ? 0 : 330 * state.level / 100
  return <article className="pa-card pa-process-silo" aria-label={device.name}>
    <div className="pa-process-heading"><h2>{device.name}</h2><StatusBadge status={state.status} /></div>
    <svg viewBox="0 0 220 440" role="img" aria-label={`${device.name}: ${state.level === null ? 'NO DATA' : `${state.level}%`}`}>
      <rect x="35" y="8" width="150" height="390" rx="70" fill="#D9DEE5" stroke="#87909B" strokeWidth="3" />
      <rect x="47" y={386-height} width="126" height={height} rx={Math.min(58,height/2)} fill={state.color} />
      <text x="110" y="220" textAnchor="middle" fill="#111318" fontSize="44">{state.level === null ? '—' : `${state.level}%`}</text>
      <rect x="25" y="393" width="170" height="32" rx="6" fill="#A8B0BA" />
    </svg>
    <div className="pa-process-level"><span>Material level</span><strong>{state.level === null ? 'NO DATA' : `${state.level}%`}</strong>{state.alarm && <StatusBadge status="ALARM" />}</div>
  </article>
}

function Mixer({ device, barrels }) {
  const state = mixerDisplay(device)
  const operation = state.status === 'RUNNING' ? 'RUN' : state.status === 'STOPPED' ? 'STOP' : 'NO DATA'
  const assigned = barrels.find(barrel => barrel.id === state.assigned)?.name || '—'
  return <article className="pa-card pa-process-mixer" aria-label={device.name}>
    <div className="pa-process-heading"><h2>{device.name}</h2><StatusBadge status={operation} /></div>
    <dl className="pa-process-feedback">
      <div><dt>Mode</dt><dd>{state.mode || 'NO DATA'}</dd></div>
      <div><dt>Barrel</dt><dd>{assigned}</dd></div>
      <div><dt>Fault</dt><dd><StatusBadge status={state.alarm === '—' ? 'NO DATA' : state.alarm === 'FAULT' ? 'ALARM' : 'NONE'} /></dd></div>
    </dl>
  </article>
}

export default function BarrelHmi({ plant }) {
  return <main className="pa-dashboard"><div className="pa-container">
    <header className="pa-header">
      <div><p className="pa-eyebrow">PENNSYLVANIA</p><h1>Barrels / Mixers</h1><p className="pa-muted">Monitoring only</p></div>
      <Link className="pa-home" to="/monitoring/pa"><ArrowLeft size={16} aria-hidden="true" /> Back to PA Overview</Link>
    </header>
    <div className="pa-process" aria-label="PA barrel and mixer system">
      <section className="pa-process-silos" aria-label="Barrels">{plant.barrels.map(device => <Silo key={device.id} device={device} />)}</section>
      <section className="pa-process-mixers" aria-label="Mixers">{plant.mixers.map(device => <Mixer key={device.id} device={device} barrels={plant.barrels} />)}</section>
    </div>
  </div></main>
}
