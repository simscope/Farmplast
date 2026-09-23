export default function PlantSummary({ plant }) {
  const items = [
    ['Chillers', plant.chillers.length || '—'],
    ['Mixers', plant.mixerSummary ?? plant.mixers.length], ['Machines', plant.machines.length],
    ['Climate Zones', plant.climateSummary ?? '—'], ['Active Alarms', plant.alarms?.length ?? '—'],
  ]
  return <section aria-label="Plant Summary" className="pa-summary">
    {items.map(([label, value]) => <div className="pa-summary-item" key={label}><span>{label}</span><strong>{value}</strong><small>{label === 'Climate Zones' ? plant.climateSummary ? 'Reported zone health' : plant.climateZones.some(zone => zone.connection !== 'NOT CONFIGURED') ? 'No data' : 'Not configured' : label === 'Mixers' && plant.mixerSummary ? 'Reported feedback' : typeof value !== 'number' ? 'Not configured' : label === 'Active Alarms' ? 'Reported alarms' : 'Planned inventory'}</small></div>)}
  </section>
}
