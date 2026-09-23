import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PlantSummary from '../components/monitoring/pa/PlantSummary'
import AlarmSummary from '../components/monitoring/pa/AlarmSummary'
import SectionHeader from '../components/monitoring/pa/SectionHeader'
import ChillerCard from '../components/monitoring/pa/ChillerCard'
import BarrelCard from '../components/monitoring/pa/BarrelCard'
import MixerStatus from '../components/monitoring/pa/MixerStatus'
import MachinePowerCard from '../components/monitoring/pa/MachinePowerCard'
import ClimateZoneCard from '../components/monitoring/pa/ClimateZoneCard'
import { adaptPaSnapshot } from '../components/monitoring/pa/snapshot'
import { adaptMachineSnapshot } from '../components/monitoring/pa/machineSnapshot'
import { adaptClimateSnapshot, withClimateState } from '../components/monitoring/pa/climateSnapshot'
import '../components/monitoring/pa/pa.css'

export default function MonitoringPAPage() {
  // Preparation only: each future shared source feeds its adapter; no reads yet.
  const plant = withClimateState(
    { ...adaptPaSnapshot(null), machines: adaptMachineSnapshot(null) },
    adaptClimateSnapshot(null),
  )
  return <main className="pa-dashboard">
    <div className="pa-container">
      <header className="pa-header">
        <div><p className="pa-eyebrow">PENNSYLVANIA</p><h1>PA PLANT</h1><p className="pa-muted">Plant overview · Monitoring only</p></div>
        <Link className="pa-home" to="/"><ArrowLeft size={16} aria-hidden="true" /> Back to Home</Link>
      </header>
      <PlantSummary plant={plant} />
      <AlarmSummary alarms={plant.alarms} />
      <section aria-labelledby="pa-chillers">
        <SectionHeader id="pa-chillers" title="Chillers" description="Cooling systems" />
        {plant.chillers.length ? <div className="pa-grid">{plant.chillers.map(device => <ChillerCard key={device.id} device={device} />)}</div>
          : <div className="pa-empty"><strong>No PA chillers configured</strong><p>Equipment and readings will appear when monitoring is configured.</p></div>}
      </section>
      <section aria-labelledby="pa-barrels">
        <SectionHeader id="pa-barrels" title="Barrels / Mixers" description={plant.barrels.length + ' barrels · ' + plant.mixers.length + ' mixers'} />
        <div className="pa-grid">{plant.barrels.map(device => <BarrelCard key={device.id} device={device} mixers={plant.mixers} />)}</div>
        <div className="pa-grid pa-mixers">{plant.mixers.map(device => <MixerStatus key={device.id} device={device} barrels={plant.barrels} />)}</div>
      </section>
      <section aria-labelledby="pa-machines">
        <SectionHeader id="pa-machines" title="Machine Power" description="Three-phase electrical monitoring" />
        <div className="pa-grid pa-machine-grid">{plant.machines.map(device => <MachinePowerCard key={device.id} device={device} />)}</div>
      </section>
      <section aria-labelledby="pa-climate">
        <SectionHeader id="pa-climate" title="Building Climate" description={plant.climateZones.length + ' zones · Environmental monitoring'} />
        <div className="pa-grid">{plant.climateZones.map(device => <ClimateZoneCard key={device.id} device={device} />)}</div>
      </section>
      <footer className="pa-muted pa-footer">PA monitoring is not configured. Dashes indicate unavailable readings.</footer>
    </div>
  </main>
}
