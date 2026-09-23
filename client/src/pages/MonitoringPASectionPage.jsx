import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ChillerCard from '../components/monitoring/pa/ChillerCard'
import BarrelCard from '../components/monitoring/pa/BarrelCard'
import MixerStatus from '../components/monitoring/pa/MixerStatus'
import MachinePowerCard from '../components/monitoring/pa/MachinePowerCard'
import ClimateZoneCard from '../components/monitoring/pa/ClimateZoneCard'
import { getPaPlant } from '../components/monitoring/pa/plant'
import '../components/monitoring/pa/pa.css'

const titles = { chillers: 'Chillers', barrels: 'Barrels / Mixers', machines: 'Machine Power', climate: 'Building Climate' }

export default function MonitoringPASectionPage({ section }) {
  const plant = getPaPlant()
  return <main className="pa-dashboard"><div className="pa-container">
    <header className="pa-header">
      <div><p className="pa-eyebrow">PENNSYLVANIA</p><h1>{titles[section]}</h1><p className="pa-muted">Equipment details · Monitoring only</p></div>
      <Link className="pa-home" to="/monitoring/pa"><ArrowLeft size={16} aria-hidden="true" /> Back to PA Overview</Link>
    </header>
    {section === 'chillers' && (plant.chillers.length
      ? <div className="pa-grid">{plant.chillers.map(device => <ChillerCard key={device.id} device={device} />)}</div>
      : <div className="pa-empty"><strong>No PA chillers configured</strong><p>Equipment and readings will appear when monitoring is configured.</p></div>)}
    {section === 'barrels' && <>
      <div className="pa-grid">{plant.barrels.map(device => <BarrelCard key={device.id} device={device} mixers={plant.mixers} />)}</div>
      <div className="pa-grid pa-mixers">{plant.mixers.map(device => <MixerStatus key={device.id} device={device} barrels={plant.barrels} />)}</div>
    </>}
    {section === 'machines' && <div className="pa-grid pa-machine-grid">{plant.machines.map(device => <MachinePowerCard key={device.id} device={device} />)}</div>}
    {section === 'climate' && <div className="pa-grid">{plant.climateZones.map(device => <ClimateZoneCard key={device.id} device={device} />)}</div>}
    <footer className="pa-muted pa-footer">PA monitoring is not configured. Dashes indicate unavailable readings.</footer>
  </div></main>
}
