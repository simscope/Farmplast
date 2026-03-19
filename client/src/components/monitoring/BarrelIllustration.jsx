import React from 'react'
import { Gauge, Package, Waves, Radar, Activity } from 'lucide-react'
import StatusPill from './StatusPill'
import { formatValue, getAssetStatus, statCardStyle } from '../../utils/monitoringHelpers'

function getPoint(asset, matcher) {
  return asset?.points?.find((p) => matcher(String(p.point_code || '').toUpperCase()))
}

function getNumericValue(point, fallback = 0) {
  const n = Number(point?.value_number)
  return Number.isFinite(n) ? n : fallback
}

export default function BarrelIllustration({ asset, isMobile }) {
  const status = getAssetStatus(asset.points)

  const levelPercentPoint = getPoint(asset, (code) => code.includes('PERCENT'))
  const levelMaPoint = getPoint(asset, (code) => code.includes('_MA'))
  const levelMmPoint = getPoint(asset, (code) => code.includes('_MM') || code.includes('LEVEL_MM'))
  const qualityPoint = getPoint(asset, (code) => code.includes('QUALITY') || code.includes('STATUS'))

  const levelPercent = Math.max(0, Math.min(100, getNumericValue(levelPercentPoint, 0)))
  const levelMa = levelMaPoint ? getNumericValue(levelMaPoint, 0) : null
  const levelMm = levelMmPoint ? getNumericValue(levelMmPoint, 0) : null
  const qualityText = qualityPoint?.value_text || qualityPoint?.quality || ''

  const fillColor =
    levelPercent < 20 ? '#ef4444' : levelPercent < 40 ? '#f59e0b' : '#22c55e'

  const levelStatusText =
    levelPercent < 20 ? 'LOW LEVEL' : levelPercent < 40 ? 'WATCH LEVEL' : 'NORMAL'

  const materialConditionText =
    levelPercent < 20 ? 'Refill required soon' : 'Stock level is acceptable'

  return (
    <div style={{ ...statCardStyle(isMobile), minHeight: isMobile ? 'auto' : 520 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>
            {asset.asset_code}
          </div>
          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4 }}>
            {asset.asset_name}
          </div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr',
          gap: 18,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            borderRadius: 24,
            padding: 14,
            background: 'rgba(2,6,23,0.42)',
            border: '1px solid rgba(148,163,184,0.1)',
          }}
        >
          <svg viewBox="0 0 280 430" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="barrelFillGradient" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={fillColor} />
                <stop offset="100%" stopColor={`${fillColor}cc`} />
              </linearGradient>
              <linearGradient id="barrelMetal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
            </defs>

            <ellipse cx="140" cy="50" rx="80" ry="24" fill="#475569" opacity="0.75" />
            <rect
              x="60"
              y="50"
              width="160"
              height="280"
              rx="40"
              fill="url(#barrelMetal)"
              stroke="rgba(148,163,184,0.3)"
              strokeWidth="4"
            />
            <ellipse
              cx="140"
              cy="50"
              rx="80"
              ry="24"
              fill="#64748b"
              stroke="rgba(148,163,184,0.3)"
              strokeWidth="4"
            />
            <ellipse
              cx="140"
              cy="330"
              rx="80"
              ry="24"
              fill="#1e293b"
              stroke="rgba(148,163,184,0.3)"
              strokeWidth="4"
            />

            <clipPath id="barrelClip">
              <rect x="72" y="62" width="136" height="256" rx="28" />
            </clipPath>

            <g clipPath="url(#barrelClip)">
              <rect
                x="72"
                y={318 - (256 * levelPercent) / 100}
                width="136"
                height={(256 * levelPercent) / 100}
                fill="url(#barrelFillGradient)"
              />
              <ellipse
                cx="140"
                cy={318 - (256 * levelPercent) / 100}
                rx="68"
                ry="12"
                fill="rgba(255,255,255,0.22)"
              />
              {status.online ? (
                <ellipse
                  cx="140"
                  cy={318 - (256 * levelPercent) / 100}
                  rx="58"
                  ry="8"
                  fill="rgba(255,255,255,0.18)"
                >
                  <animate attributeName="ry" values="8;10;8" dur="2.6s" repeatCount="indefinite" />
                </ellipse>
              ) : null}
            </g>

            <line
              x1="210"
              y1="88"
              x2="250"
              y2="88"
              stroke="#38bdf8"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="250" cy="88" r="10" fill="#38bdf8" />
            <text
              x="248"
              y="70"
              textAnchor="end"
              fill="#bae6fd"
              fontSize="12"
              fontWeight="700"
            >
              RADAR
            </text>

            <text
              x="140"
              y="190"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="40"
              fontWeight="900"
            >
              {levelPercent.toFixed(1)}%
            </text>
            <text
              x="140"
              y="214"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="14"
              fontWeight="700"
            >
              MATERIAL LEVEL
            </text>
          </svg>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Radar size={16} /> Radar level
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {levelPercent.toFixed(1)}%
            </div>
          </div>

          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Gauge size={16} /> Current loop
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {levelMaPoint ? formatValue(levelMaPoint) : '—'}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Waves size={16} /> Measured height
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              {levelMm !== null ? `${levelMm.toFixed(0)} mm` : '—'}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>STATUS</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: fillColor }}>
              {levelStatusText}
            </div>
            {qualityText ? (
              <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                QUALITY: {qualityText}
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Package size={16} /> Material condition
            </div>
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>
              {materialConditionText}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(2,6,23,0.46)',
              borderRadius: 18,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Activity size={16} /> Live source
            </div>
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>
              RS485 radar → ESP32 → Supabase
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
