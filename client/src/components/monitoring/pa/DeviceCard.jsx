import StatusBadge from './StatusBadge'
export default function DeviceCard({ device, category, children }) {
  return <article className="pa-card" aria-label={device.name}>
    <div className="pa-card-heading"><div><p className="pa-eyebrow">{category}</p><h3>{device.name}</h3></div><StatusBadge status={device.connection ?? 'NO DATA'} /></div>
    {children}
  </article>
}
export function Readings({ rows }) {
  return <dl className="pa-readings">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
}
