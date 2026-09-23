import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Snowflake, Cylinder, Zap, Thermometer } from 'lucide-react'
import PlantSummary from '../components/monitoring/pa/PlantSummary'
import AlarmSummary from '../components/monitoring/pa/AlarmSummary'
import StatusBadge from '../components/monitoring/pa/StatusBadge'
import { getPaPlant } from '../components/monitoring/pa/plant'
import '../components/monitoring/pa/pa.css'

export default function MonitoringPAPage() {
  const plant = getPaPlant()
  const sections = [
    { id: 'chillers', title: 'Chillers', summary: plant.chillers.length ? `${plant.chillers.length} chillers` : 'No PA chillers configured', icon: <Snowflake size={24} aria-hidden="true" />, status: 'NOT CONFIGURED' },
    { id: 'barrels', title: 'Barrels / Mixers', summary: `${plant.barrels.length} barrels · ${plant.mixers.length} mixers`, icon: <Cylinder size={24} aria-hidden="true" /> },
    { id: 'machines', title: 'Machine Power', summary: `${plant.machines.length} machines`, icon: <Zap size={24} aria-hidden="true" /> },
    { id: 'climate', title: 'Climate', summary: `${plant.climateZones.length} zones`, icon: <Thermometer size={24} aria-hidden="true" /> },
  ]
  return <main className="pa-dashboard pa-overview"><div className="pa-container">
    <header className="pa-header">
      <div><p className="pa-eyebrow">PENNSYLVANIA</p><h1>PA PLANT</h1><p className="pa-muted">Plant overview · Monitoring only</p></div>
      <Link className="pa-home" to="/"><ArrowLeft size={16} aria-hidden="true" /> Back to Home</Link>
    </header>
    <PlantSummary plant={plant} />
    <AlarmSummary alarms={plant.alarms} />
    <nav className="pa-section-nav" aria-label="PA equipment sections">
      {sections.map(({ id, title, summary, icon, status }) => <Link key={id} className="pa-section-link" to={`/monitoring/pa/${id}`}>
        <div className="pa-section-title">{icon}<h2>{title}</h2></div>
        <p className="pa-section-count">{summary}</p>
        <div className="pa-section-bottom"><StatusBadge status={status} /><span className="pa-open">OPEN <ArrowUpRight size={18} aria-hidden="true" /></span></div>
      </Link>)}
    </nav>
  </div></main>
}
