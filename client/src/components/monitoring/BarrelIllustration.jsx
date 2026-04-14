import React from 'react'
import { Radar, Ruler, Thermometer } from 'lucide-react'
import StatusPill from './StatusPill'
import { getAssetStatus, statCardStyle } from '../../utils/monitoringHelpers'

function findPoint(asset, matcher) {
  return asset?.points?.find((p) => matcher(String(p.point_code || '').toUpperCase()))
}

function getNumeric(point, fallback = 0) {
  const n = Number(point?.value_number)
  return Number.isFinite(n) ? n : fallback
}

function getBoolean(point, fallback = null) {
  if (typeof point?.value_boolean === 'boolean') return point.value_boolean
  if (typeof point?.value_boolean === 'string') {
    const v = point.value_boolean.toLowerCase()
    if (v === 'true') return true
    if (v === 'false') return false
  }
  return fallback
}

export default function BarrelIllustration({ asset, isMobile }) {
  const derivedStatus = getAssetStatus(asset?.points || [])

  const onlinePoint = findPoint(
    asset,
    (code) =>
      code === 'BARREL1_ONLINE' ||
      code.endsWith('_ONLINE') ||
      code.includes('ONLINE')
  )

  const percentPoint = findPoint(
    asset,
    (code) =>
      code === 'BARREL1_LEVEL_PERCENT' ||
      code.includes('LEVEL_PERCENT') ||
      code.includes('PERCENT')
  )

  const distancePoint = findPoint(
    asset,
    (code) =>
      code === 'BARREL1_DISTANCE_M' ||
      code.includes('DISTANCE_M')
  )

  const tempPoint = findPoint(
    asset,
    (code) =>
      code === 'BARREL1_SENSOR_TEMP_C' ||
      code.includes('SENSOR_TEMP_C') ||
      code.includes('TEMP_C')
  )

  const levelPercent = Math.max(0, Math.min(100, getNumeric(percentPoint, 0)))
  const distanceM = getNumeric(distancePoint, 0)
  const tempC = getNumeric(tempPoint, 0)

  const explicitOnline = getBoolean(onlinePoint, null)
  const online = explicitOnline ?? derivedStatus.online

  const fillColor =
    levelPercent < 10 ? '#ef4444' : levelPercent < 20 ? '#f59e0b' : levelPercent < 40 ? '#eab308' : '#22c55e'

  const fillHeight = Math.max(8, (levelPercent / 100) * 240)

  const statusText =
    levelPercent < 10
      ? 'ALARM LOW'
      : levelPercent < 20
        ? 'LOW LEVEL'
        : levelPercent < 40
          ? 'WATCH LEVEL'
          : 'NORMAL'

  const metaText = online ? 'LIVE DATA' : 'OFFLINE / NO FRESH DATA'

  return (
    <div style={{ ...statCardStyle(isMobile), minHeight: isMobile ? 'auto' : 460 }}>
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
            {asset?.asset_code || 'BARREL'}
          </div>
          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, marginTop: 4 }}>
            {asset?.asset_name || 'Material Barrel'}
          </div>
          <div style={{ marginTop: 6, color: '#64748b', fontSize: 11, fontWeight: 800 }}>
            {metaText}
          </div>
        </div>

        <StatusPill online={online} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr',
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
                y={318 - fillHeight}
                width="136"
                height={fillHeight}
                fill="url(#barrelFillGradient)"
              />
              <ellipse
                cx="140"
                cy={318 - fillHeight}
                rx="68"
                ry="12"
                fill="rgba(255,255,255,0.18)"
              />
            </g>

            <line
              x1="206"
              y1="90"
              x2="248"
              y2="90"
              stroke="#38bdf8"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="248" cy="90" r="10" fill="#38bdf8" />

            <text
              x="248"
              y="72"
              textAnchor="end"
              fill="#bae6fd"
              fontSize="12"
              fontWeight="700"
            >
              RADAR
            </text>

            <text
              x="140"
              y="180"
              textAnchor="middle"
              fill="#f8fafc"
              fontSize="40"
              fontWeight="900"
            >
              {levelPercent.toFixed(1)}%
            </text>

            <text
              x="140"
              y="206"
              textAnchor="middle"
              fill="#cbd5e1"
              fontSize="14"
              fontWeight="700"
            >
              MATERIAL LEVEL
            </text>

            <text
              x="140"
              y="235"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="13"
              fontWeight="700"
            >
              T {tempC.toFixed(1)} °C
            </text>

            <text
              x="140"
              y="255"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="13"
              fontWeight="700"
            >
              D {distanceM.toFixed(2)} m
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#cbd5e1',
                fontWeight: 800,
              }}
            >
              <Radar size={16} /> Radar level
            </div>

            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#cbd5e1',
                fontWeight: 800,
              }}
            >
              <Thermometer size={16} /> Sensor temperature
            </div>

            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>
              {tempC.toFixed(1)} °C
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#cbd5e1',
                fontWeight: 800,
              }}
            >
              <Ruler size={16} /> Distance to material
            </div>

            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>
              {distanceM.toFixed(2)} m
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
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>
              STATUS
            </div>

            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: fillColor }}>
              {statusText}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
