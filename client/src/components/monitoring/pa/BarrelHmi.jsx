import { useState } from 'react'
import { Link } from 'react-router-dom'
import { siloDisplay, mixerDisplay } from './panelDisplay'
import './barrelHmi.css'

function Silo({ device, number }) {
  const state = siloDisplay(device)
  const height = state.level === null ? 0 : 330 * state.level / 100
  return <svg className="pa-panel-silo" viewBox="0 0 280 650" role="img" aria-label={`SILO ${number}: ${state.level === null ? 'NO DATA' : `${state.level}%`}, ${state.status}${state.alarm ? ', ALARM' : ''}`}>
    <rect x="1" y="1" width="278" height="648" rx="8" fill="#1D242C" stroke="#35414E" strokeWidth="2" />
    <text x="140" y="44" textAnchor="middle">SILO {number}</text>
    <rect x="65" y="94" width="150" height="390" rx="70" fill="#D9DEE5" stroke="#87909B" strokeWidth="3" />
    <rect x="77" y={472-height} width="126" height={height} rx={Math.min(58,height/2)} fill={state.color} />
    <text x="140" y="305" textAnchor="middle" fill="#111318" fontSize="48">{state.level === null ? '—' : `${state.level}%`}</text>
    <rect x="55" y="479" width="170" height="42" rx="6" fill="#A8B0BA" />
    <text x="140" y="563" textAnchor="middle" fill="#CAD2DC">RAW {state.raw}</text>
    <text x="140" y="610" textAnchor="middle" fill={state.color}>{state.status}</text>
    {state.alarm && <text x="140" y="637" textAnchor="middle" fill="#FFB4A8">ALARM</text>}
  </svg>
}

function Mixer({ device, number }) {
  const state = mixerDisplay(device)
  return <div className="pa-panel-mixer" role="group" aria-label={`MIXER ${number}`}>
    <svg viewBox="0 0 360 570" role="img" aria-label={`MIXER ${number}: ${state.status}, alarm ${state.alarm}`}>
      <rect x="1" y="1" width="358" height="568" rx="8" fill="#202832" stroke="#3A4654" strokeWidth="2" />
      <text x="180" y="50" textAnchor="middle">MIXER {number}</text>
      <text x="180" y="237" textAnchor="middle" fill="#DCE3EC">VACUUM HOPPER LOADER</text>
      <text x="28" y="291" fill="#AEB9C6">MATERIAL LOADS</text>
      <text x="255" y="291" textAnchor="middle">—</text>
      <text x="28" y="356" fill="#AEB9C6">COLOR LOADS</text>
      <text x="255" y="356" textAnchor="middle">—</text>
      <text x="180" y="432" textAnchor="middle" fill="#AEB9C6">RATIO  — : —</text>
      <text x="28" y="501" fill="#DCE3EC">STATUS: {state.status}</text>
      <text x="28" y="540" fill="#DCE3EC">CYCLE: —     ALARM: {state.alarm}</text>
    </svg>
    <button disabled className="pa-panel-start" aria-label={`Mixer ${number} START unavailable`}>START</button>
    <button disabled className="pa-panel-stop" aria-label={`Mixer ${number} STOP unavailable`}>STOP</button>
    {[['material',260],['color',325]].map(([kind,y]) => <span key={kind}>
      <button disabled className="pa-panel-adjust" style={{left:'49.444%',top:`${y/570*100}%`}} aria-label={`Mixer ${number} decrease ${kind} unavailable`}>−</button>
      <button disabled className="pa-panel-adjust" style={{left:'77.778%',top:`${y/570*100}%`}} aria-label={`Mixer ${number} increase ${kind} unavailable`}>+</button>
    </span>)}
    {(state.mode || state.assigned) && <p className="pa-panel-extra">{state.mode && `MODE: ${state.mode}`} {state.assigned && `BARREL: ${state.assigned}`}</p>}
  </div>
}

export default function BarrelHmi({ plant }) {
  const [screen, setScreen] = useState('silos')
  const silos = screen === 'silos'
  return <main className="pa-panel-page">
    <div className="pa-panel-toolbar"><Link to="/monitoring/pa">← Back to PA Overview</Link><span>PA · MONITORING ONLY · Controls disabled</span></div>
    <section className={`pa-panel ${silos ? 'pa-panel-silos' : 'pa-panel-mixers'}`} aria-label="PA cabinet HMI">
      <header className="pa-panel-header">
        <h1>{silos ? 'Material Silo Monitoring' : 'Mixers'}</h1>
        <p className="pa-panel-link-state">{plant.cabinetConnection === 'ONLINE' ? 'PLC LINK OK' : `PLC: ${plant.cabinetConnection || 'NO DATA'}`}</p>
        <button onClick={() => setScreen(silos ? 'mixers' : 'silos')}>{silos ? 'MIXERS' : 'HOME / SILOS'}</button>
      </header>
      {silos ? <div className="pa-panel-silo-grid">{plant.barrels.map((device,index) => <Silo key={device.id} device={device} number={index+1} />)}</div>
        : <div className="pa-panel-mixer-grid">{plant.mixers.map((device,index) => <Mixer key={device.id} device={device} number={index+1} />)}</div>}
      <p className="pa-panel-note">{silos ? 'Silo levels' : 'Mixer feedback and recipes'}: unavailable values show —. No commands are sent.</p>
    </section>
  </main>
}
