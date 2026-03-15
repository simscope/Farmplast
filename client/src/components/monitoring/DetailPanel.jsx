import React from 'react'
import { Activity, Droplets } from 'lucide-react'
import StatusPill from './StatusPill'
import { formatValue, getAssetStatus, statCardStyle } from '../../utils/monitoringHelpers'

export default function DetailPanel({ asset, isMobile }) {
  if (!asset) {
    return (
      <div
        style={{
          ...statCardStyle(isMobile),
          minHeight: isMobile ? 220 : 480,
          display: 'grid',
          placeItems: 'center',
          color: '#94a3b8',
          textAlign: 'center',
        }}
      >
        Select a chiller to open equipment details.
      </div>
    )
  }

  const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
  const compressors = asset.points.filter(
    (p) => p.point_group === 'compressors' || String(p.point_code || '').includes('COMP')
  )
  const status = getAssetStatus(asset.points)

  return (
    <div style={{ ...statCardStyle(isMobile), minHeight: isMobile ? 'auto' : 480 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, marginTop: 4 }}>
            {asset.asset_name}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
            Live industrial visualization with equipment metrics
          </div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16,
        }}
      >
        <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
            <Droplets size={16} /> Water temperatures
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {temperatures.map((point) => (
              <div
                key={point.point_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'rgba(15,23,42,0.85)',
                }}
              >
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                <span style={{ fontWeight: 900, whiteSpace: 'nowrap' }}>{formatValue(point)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
            <Activity size={16} /> Compressor status
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {compressors.map((point) => (
              <div
                key={point.point_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: point.value_boolean ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  border: `1px solid ${point.value_boolean ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.2)'}`,
                }}
              >
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                <span
                  style={{
                    fontWeight: 900,
                    color: point.value_boolean ? '#4ade80' : '#f87171',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(point)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
