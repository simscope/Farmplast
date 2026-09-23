const tones = {
  ONLINE: 'good', RUNNING: 'good', RUN: 'good', NORMAL: 'good',
  WARNING: 'warning', ALARM: 'danger', CRITICAL: 'danger',
  INFO: 'info', COOL: 'info', HEAT: 'warning',
}
export default function StatusBadge({ status = 'NO DATA' }) {
  return <span className={`pa-badge pa-tone-${tones[status] || 'neutral'}`}>{status}</span>
}
