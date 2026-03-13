import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Droplets,
  Factory,
  Gauge,
  MapPin,
  Package,
  Waves,
  Wifi,
  WifiOff,
  Wind,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 5000
const ONLINE_THRESHOLD_SEC = 90

const LOCATIONS = [
  {
    code: 'PA',
    title: 'Pennsylvania',
    subtitle: 'Production monitoring',
    description: 'Open plant overview and equipment status',
    active: false,
    gradient: 'linear-gradient(135deg, #1f2937 0%, #0f172a 100%)',
  },
  {
    code: 'NJ',
    title: 'New Jersey',
    subtitle: 'Farmplast production',
    description: 'Chillers, barrel level and live telemetry',
    active: true,
    gradient: 'linear-gradient(135deg, #0f766e 0%, #0f172a 100%)',
  },
]

const mockRows = [
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-1',
    point_code: 'CHW_IN',
    point_name: 'Chilled Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 52.4,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-2',
    point_code: 'CHW_OUT',
    point_name: 'Chilled Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 44.6,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-3',
    point_code: 'COND_WATER_IN',
    point_name: 'Condenser Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 78.2,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 3,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-4',
    point_code: 'COND_WATER_OUT',
    point_name: 'Condenser Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 86.1,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 4,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-5',
    point_code: 'COMP_A',
    point_name: 'Compressor A',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: true,
    updated_at: new Date().toISOString(),
    display_order: 5,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-6',
    point_code: 'COMP_B',
    point_name: 'Compressor B',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: false,
    updated_at: new Date().toISOString(),
    display_order: 6,
  },

  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-1',
    point_code: 'CHW_IN',
    point_name: 'Chilled Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 51.8,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-2',
    point_code: 'CHW_OUT',
    point_name: 'Chilled Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 43.9,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-3',
    point_code: 'COND_WATER_IN',
    point_name: 'Condenser Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 79.4,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 3,
  },
  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-4',
    point_code: 'COND_WATER_OUT',
    point_name: 'Condenser Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 87.8,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 4,
  },
  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-5',
    point_code: 'COMP_A',
    point_name: 'Compressor A',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: true,
    updated_at: new Date().toISOString(),
    display_order: 5,
  },
  {
    asset_id: '2',
    asset_code: 'CH-NJ-02',
    asset_name: 'Chiller 02',
    asset_type: 'chiller',
    point_id: '2-6',
    point_code: 'COMP_B',
    point_name: 'Compressor B',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: true,
    updated_at: new Date().toISOString(),
    display_order: 6,
  },

  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-1',
    point_code: 'CHW_IN',
    point_name: 'Chilled Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 53.1,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-2',
    point_code: 'CHW_OUT',
    point_name: 'Chilled Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 45.2,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-3',
    point_code: 'COND_WATER_IN',
    point_name: 'Condenser Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 80.1,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 3,
  },
  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-4',
    point_code: 'COND_WATER_OUT',
    point_name: 'Condenser Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 88.4,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 4,
  },
  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-5',
    point_code: 'COMP_A',
    point_name: 'Compressor A',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: false,
    updated_at: new Date().toISOString(),
    display_order: 5,
  },
  {
    asset_id: '3',
    asset_code: 'CH-NJ-03',
    asset_name: 'Chiller 03',
    asset_type: 'chiller',
    point_id: '3-6',
    point_code: 'COMP_B',
    point_name: 'Compressor B',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: true,
    updated_at: new Date().toISOString(),
    display_order: 6,
  },

  {
    asset_id: '4',
    asset_code: 'BR-NJ-01',
    asset_name: 'Material Barrel',
    asset_type: 'barrel',
    point_id: '4-1',
    point_code: 'LEVEL_PERCENT',
    point_name: 'Level Percent',
    point_group: 'level',
    data_type: 'number',
    value_number: 67.8,
    unit: '%',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '4',
    asset_code: 'BR-NJ-01',
    asset_name: 'Material Barrel',
    asset_type: 'barrel',
    point_id: '4-2',
    point_code: 'LEVEL_MA',
    point_name: 'Current Loop',
    point_group: 'level',
    data_type: 'number',
    value_number: 14.84,
    unit: 'mA',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
]

function normalizeRow(row) {
  return {
    asset_id: row.asset_id,
    asset_code: row.asset_code,
    asset_name: row.asset_name,
    asset_type: row.asset_type,
    device_id: row.device_id,
    device_code: row.device_code,
    device_name: row.device_name,
    point_id: row.point_id,
    point_code: row.point_code,
    point_name: row.point_name,
    point_group: row.point_group,
    point_type: row.point_type,
    data_type: row.data_type,
    unit: row.unit || '',
    display_order: row.display_order ?? 0,
    value_number:
      row.value_number === null || row.value_number === undefined
        ? null
        : Number(row.value_number),
    value_boolean:
      row.value_boolean === null || row.value_boolean === undefined
        ? null
        : row.value_boolean,
    value_text: row.value_text,
    quality: row.quality,
    updated_at: row.updated_at,
  }
}

function formatValue(point) {
  if (point?.data_type === 'boolean') return point.value_boolean ? 'ON' : 'OFF'

  if (point?.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
    if (Number.isNaN(num)) return '—'
    if (point.unit === '%') return `${num.toFixed(1)}%`
    if (point.unit === 'mA') return `${num.toFixed(2)} mA`
    if (point.unit === 'F') return `${num.toFixed(1)}°F`
    return `${num.toFixed(1)}${point.unit ? ` ${point.unit}` : ''}`
  }

  return point?.value_text || '—'
}

function getLatestTime(points) {
  let latest = null
  for (const p of points) {
    if (!p?.updated_at) continue
    const d = new Date(p.updated_at)
    if (Number.isNaN(d.getTime())) continue
    if (!latest || d > latest) latest = d
  }
  return latest
}

function getAssetStatus(points) {
  const latest = getLatestTime(points)
  if (!latest) return { online: false, label: 'OFFLINE' }

  const secondsAgo = Math.floor((Date.now() - latest.getTime()) / 1000)
  return {
    online: secondsAgo <= ONLINE_THRESHOLD_SEC,
    label: secondsAgo <= ONLINE_THRESHOLD_SEC ? 'ONLINE' : 'OFFLINE',
  }
}

function groupAssets(rows) {
  const grouped = {}

  for (const row of rows) {
    if (!row.asset_code) continue

    if (!grouped[row.asset_code]) {
      grouped[row.asset_code] = {
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        asset_type: row.asset_type,
        points: [],
      }
    }

    grouped[row.asset_code].points.push(row)
  }

  return Object.values(grouped)
    .map((asset) => ({
      ...asset,
      points: [...asset.points].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    }))
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code))
}

function statCardStyle() {
  return {
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: 24,
    padding: 18,
    boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
    backdropFilter: 'blur(10px)',
  }
}

function pageButtonStyle(active = true) {
  return {
    border: '1px solid rgba(148,163,184,0.18)',
    background: active ? 'rgba(8,47,73,0.84)' : 'rgba(15,23,42,0.7)',
    color: '#e2e8f0',
    borderRadius: 16,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 800,
  }
}

function StatusPill({ online }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '8px 14px',
        background: online ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
        color: online ? '#4ade80' : '#f87171',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.6,
      }}
    >
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {online ? 'ONLINE' : 'OFFLINE'}
    </div>
  )
}

function LocationSelector({ onSelect }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #0f766e 0%, #020617 45%, #01030a 100%)',
        color: '#f8fafc',
        padding: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1260 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
            SIM SCOPE / FARMPLAST
          </div>
          <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(34px, 5vw, 64px)', lineHeight: 1.02 }}>
            Choose production location
          </h1>
          <div style={{ color: '#cbd5e1', fontSize: 16 }}>
            Open plant overview with live industrial telemetry
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          {LOCATIONS.map((loc) => (
            <button
              key={loc.code}
              onClick={() => loc.active && onSelect(loc.code)}
              style={{
                border: loc.active
                  ? '1px solid rgba(103,232,249,0.28)'
                  : '1px solid rgba(148,163,184,0.14)',
                background: loc.gradient,
                color: '#fff',
                borderRadius: 30,
                padding: 26,
                textAlign: 'left',
                cursor: loc.active ? 'pointer' : 'not-allowed',
                opacity: loc.active ? 1 : 0.55,
                minHeight: 260,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.08 }}>
                <Factory size={180} strokeWidth={1.2} />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 18,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.14)',
                  }}
                >
                  <MapPin size={28} />
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: loc.active ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.16)',
                    color: loc.active ? '#4ade80' : '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {loc.active ? 'AVAILABLE' : 'COMING SOON'}
                </div>
              </div>

              <div style={{ position: 'relative', zIndex: 1, marginTop: 22 }}>
                <div style={{ color: '#67e8f9', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                  {loc.code}
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{loc.title}</div>
                <div style={{ fontSize: 16, color: '#dbeafe', marginTop: 8 }}>{loc.subtitle}</div>
                <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 18, maxWidth: 400 }}>
                  {loc.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChillerIllustration({ asset, selected, onSelect }) {
  const status = getAssetStatus(asset.points)
  const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
  const compressors = asset.points.filter(
    (p) => p.point_group === 'compressors' || String(p.point_code || '').includes('COMP')
  )

  const chwIn = temperatures.find((p) => String(p.point_code || '').includes('CHW_IN'))
  const chwOut = temperatures.find((p) => String(p.point_code || '').includes('CHW_OUT'))
  const condIn = temperatures.find((p) => String(p.point_code || '').includes('COND_WATER_IN'))
  const condOut = temperatures.find((p) => String(p.point_code || '').includes('COND_WATER_OUT'))
  const activeComps = compressors.filter((p) => p.value_boolean === true).length
  const allOnline = status.online

  return (
    <button
      onClick={onSelect}
      style={{
        ...statCardStyle(),
        width: '100%',
        padding: 20,
        textAlign: 'left',
        cursor: 'pointer',
        border: selected ? '1px solid rgba(34,211,238,0.34)' : '1px solid rgba(148, 163, 184, 0.14)',
        boxShadow: selected
          ? '0 16px 40px rgba(14,165,233,0.16)'
          : '0 10px 30px rgba(0,0,0,0.24)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900 }}>{asset.asset_name}</div>
        </div>
        <StatusPill online={allOnline} />
      </div>

      <div
        style={{
          borderRadius: 22,
          overflow: 'hidden',
          border: '1px solid rgba(148,163,184,0.12)',
          background:
            'linear-gradient(180deg, rgba(5,10,20,0.88) 0%, rgba(15,23,42,0.92) 100%)',
          padding: 14,
        }}
      >
        <svg viewBox="0 0 720 260" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id={`chillerBody-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id={`waterPipe-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            <linearGradient id={`hotPipe-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>

            <filter id={`softGlow-${asset.asset_code}`}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="110" y="40" rx="24" ry="24" width="340" height="160" fill={`url(#chillerBody-${asset.asset_code})`} stroke="rgba(148,163,184,0.24)" />
          <rect x="130" y="60" rx="18" ry="18" width="300" height="120" fill="#111827" stroke="rgba(148,163,184,0.18)" />

          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={190 + i * 90}
              cy={120}
              r="32"
              fill="#020617"
              stroke={allOnline ? '#22d3ee' : '#475569'}
              strokeWidth="3"
            />
          ))}

          {[0, 1, 2].map((i) => (
            <g key={`fan-${i}`} transform={`translate(${190 + i * 90}, 120)`}>
              <circle cx="0" cy="0" r="6" fill={allOnline ? '#67e8f9' : '#64748b'} />
              <path d="M0 -22 C8 -8 10 -2 2 4 C-4 2 -8 -4 0 -22Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 0 0"
                    to="360 0 0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </path>
              <path d="M22 0 C8 8 2 10 -4 2 C-2 -4 4 -8 22 0Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 0 0"
                    to="360 0 0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </path>
              <path d="M0 22 C-8 8 -10 2 -2 -4 C4 -2 8 4 0 22Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 0 0"
                    to="360 0 0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </path>
              <path d="M-22 0 C-8 -8 -2 -10 4 -2 C2 4 -4 8 -22 0Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 0 0"
                    to="360 0 0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </path>
            </g>
          ))}

          <rect x="470" y="60" rx="18" ry="18" width="120" height="120" fill="#0b1120" stroke="rgba(148,163,184,0.18)" />
          <rect x="485" y="78" rx="10" ry="10" width="90" height="22" fill={activeComps > 0 ? '#052e2b' : '#3f0d18'} stroke={activeComps > 0 ? '#22c55e' : '#ef4444'} />
          <text x="530" y="94" textAnchor="middle" fontSize="11" fill="#e2e8f0" fontWeight="700">
            COMPRESSORS
          </text>
          <text x="530" y="135" textAnchor="middle" fontSize="32" fill="#f8fafc" fontWeight="900">
            {activeComps}
          </text>
          <text x="530" y="157" textAnchor="middle" fontSize="12" fill="#94a3b8" fontWeight="700">
            ACTIVE
          </text>

          <line x1="88" y1="86" x2="110" y2="86" stroke={`url(#waterPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" />
          <line x1="88" y1="156" x2="110" y2="156" stroke={`url(#hotPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" />

          <line x1="590" y1="86" x2="650" y2="86" stroke={`url(#waterPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" />
          <line x1="590" y1="156" x2="650" y2="156" stroke={`url(#hotPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" />

          <circle cx="88" cy="86" r="9" fill="#38bdf8" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="88" cy="156" r="9" fill="#fb7185" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="650" cy="86" r="9" fill="#38bdf8" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="650" cy="156" r="9" fill="#fb7185" filter={`url(#softGlow-${asset.asset_code})`} />

          {allOnline ? (
            <>
              <circle cx="88" cy="86" r="5" fill="#bae6fd">
                <animate attributeName="cx" values="88;110;240;420;590;650" dur="3.2s" repeatCount="indefinite" />
              </circle>
              <circle cx="650" cy="156" r="5" fill="#fecdd3">
                <animate attributeName="cx" values="650;590;420;240;110;88" dur="3.8s" repeatCount="indefinite" />
              </circle>
            </>
          ) : null}

          <text x="88" y="68" textAnchor="middle" fontSize="12" fill="#bae6fd" fontWeight="700">
            {formatValue(chwIn)}
          </text>
          <text x="88" y="176" textAnchor="middle" fontSize="12" fill="#fecdd3" fontWeight="700">
            {formatValue(condIn)}
          </text>
          <text x="650" y="68" textAnchor="middle" fontSize="12" fill="#bae6fd" fontWeight="700">
            {formatValue(chwOut)}
          </text>
          <text x="650" y="176" textAnchor="middle" fontSize="12" fill="#fecdd3" fontWeight="700">
            {formatValue(condOut)}
          </text>
        </svg>
      </div>
    </button>
  )
}

function BarrelIllustration({ asset }) {
  const status = getAssetStatus(asset.points)
  const levelPercentPoint = asset.points.find((p) => String(p.point_code || '').includes('PERCENT'))
  const levelMaPoint = asset.points.find((p) => String(p.point_code || '').includes('_MA'))
  const levelPercent = Math.max(0, Math.min(100, Number(levelPercentPoint?.value_number ?? 0)))
  const fillColor = levelPercent < 20 ? '#ef4444' : levelPercent < 40 ? '#f59e0b' : '#22c55e'

  return (
    <div style={{ ...statCardStyle(), minHeight: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{asset.asset_name}</div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18, alignItems: 'center' }}>
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
            <rect x="60" y="50" width="160" height="280" rx="40" fill="url(#barrelMetal)" stroke="rgba(148,163,184,0.3)" strokeWidth="4" />
            <ellipse cx="140" cy="50" rx="80" ry="24" fill="#64748b" stroke="rgba(148,163,184,0.3)" strokeWidth="4" />
            <ellipse cx="140" cy="330" rx="80" ry="24" fill="#1e293b" stroke="rgba(148,163,184,0.3)" strokeWidth="4" />

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
                <ellipse cx="140" cy={318 - (256 * levelPercent) / 100} rx="58" ry="8" fill="rgba(255,255,255,0.18)">
                  <animate attributeName="ry" values="8;10;8" dur="2.6s" repeatCount="indefinite" />
                </ellipse>
              ) : null}
            </g>

            <line x1="210" y1="88" x2="250" y2="88" stroke="#38bdf8" strokeWidth="8" strokeLinecap="round" />
            <circle cx="250" cy="88" r="10" fill="#38bdf8" />
            <text x="248" y="70" textAnchor="end" fill="#bae6fd" fontSize="12" fontWeight="700">
              SENSOR
            </text>

            <text x="140" y="190" textAnchor="middle" fill="#f8fafc" fontSize="40" fontWeight="900">
              {levelPercent.toFixed(1)}%
            </text>
            <text x="140" y="214" textAnchor="middle" fill="#cbd5e1" fontSize="14" fontWeight="700">
              MATERIAL LEVEL
            </text>
          </svg>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 18, padding: 14, border: '1px solid rgba(148,163,184,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Gauge size={16} /> Current loop
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>{levelMaPoint ? formatValue(levelMaPoint) : '—'}</div>
          </div>

          <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 18, padding: 14, border: '1px solid rgba(148,163,184,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Waves size={16} /> Live fill level
            </div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>{levelPercent.toFixed(1)}%</div>
          </div>

          <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 18, padding: 14, border: '1px solid rgba(148,163,184,0.08)' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>STATUS</div>
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: fillColor }}>
              {levelPercent < 20 ? 'LOW LEVEL' : levelPercent < 40 ? 'WATCH LEVEL' : 'NORMAL'}
            </div>
          </div>

          <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 18, padding: 14, border: '1px solid rgba(148,163,184,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
              <Package size={16} /> Material condition
            </div>
            <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>
              {levelPercent < 20 ? 'Refill required soon' : 'Stock level is acceptable'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ asset }) {
  if (!asset) {
    return (
      <div style={{ ...statCardStyle(), minHeight: 480, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
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
    <div style={{ ...statCardStyle(), minHeight: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>{asset.asset_name}</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>
            Live industrial visualization with equipment metrics
          </div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
            <Droplets size={16} /> Water temperatures
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {temperatures.map((point) => (
              <div key={point.point_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 14, background: 'rgba(15,23,42,0.85)' }}>
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                <span style={{ fontWeight: 900 }}>{formatValue(point)}</span>
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
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: point.value_boolean ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  border: `1px solid ${point.value_boolean ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.2)'}`,
                }}
              >
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                <span style={{ fontWeight: 900, color: point.value_boolean ? '#4ade80' : '#f87171' }}>
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

export default function MonitoringPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [location, setLocation] = useState(null)
  const [selectedAssetCode, setSelectedAssetCode] = useState('CH-NJ-01')
  const [useMockData, setUseMockData] = useState(false)

  async function fetchData() {
    try {
      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select(`
          asset_id,
          asset_code,
          asset_name,
          asset_type,
          device_id,
          device_code,
          device_name,
          point_id,
          point_code,
          point_name,
          point_group,
          point_type,
          data_type,
          unit,
          display_order,
          value_number,
          value_boolean,
          value_text,
          quality,
          updated_at
        `)
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) throw error

      if (!data || !data.length) {
        setRows(mockRows)
        setUseMockData(true)
        setError('В v_asset_points_latest пока нет данных. Показаны demo значения.')
        return
      }

      const normalized = data.map(normalizeRow)
      setRows(normalized)
      setUseMockData(false)
      setError(null)
    } catch (err) {
      setRows(mockRows)
      setUseMockData(true)
      setError(err?.message || 'Ошибка загрузки данных из Supabase. Показаны demo значения.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    const timer = setInterval(fetchData, POLL_INTERVAL_MS)

    const channel = supabase
      .channel('monitoring-telemetry-latest')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_latest',
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  const assets = useMemo(() => groupAssets(rows), [rows])

  const njAssets = useMemo(() => {
    return assets.filter((a) => String(a.asset_code || '').includes('-NJ-'))
  }, [assets])

  const chillers = useMemo(() => {
    return njAssets.filter((a) => String(a.asset_type || '').toLowerCase() === 'chiller')
  }, [njAssets])

  const barrel = useMemo(() => {
    return njAssets.find((a) => String(a.asset_type || '').toLowerCase() === 'barrel')
  }, [njAssets])

  const selectedAsset = useMemo(() => {
    return chillers.find((a) => a.asset_code === selectedAssetCode) || chillers[0] || null
  }, [chillers, selectedAssetCode])

  const summary = useMemo(() => {
    const online = njAssets.filter((a) => getAssetStatus(a.points).online).length
    const offline = njAssets.length - online

    const compressorsOn = njAssets
      .flatMap((a) => a.points)
      .filter(
        (p) =>
          (p.point_group === 'compressors' || String(p.point_code || '').includes('COMP')) &&
          p.value_boolean === true
      ).length

    const barrelLevelPoint = njAssets
      .flatMap((a) => a.points)
      .find((p) => String(p.point_code || '') === 'LEVEL_PERCENT')

    return {
      total: njAssets.length,
      online,
      offline,
      compressorsOn,
      barrelLevel: Number(barrelLevelPoint?.value_number ?? 0),
    }
  }, [njAssets])

  if (!location) return <LocationSelector onSelect={setLocation} />

  if (location === 'PA') {
    return (
      <div style={{ minHeight: '100vh', background: '#020617', color: '#fff', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ ...statCardStyle(), maxWidth: 700, textAlign: 'center' }}>
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900 }}>PENNSYLVANIA</div>
          <h1 style={{ margin: '10px 0' }}>Dashboard coming soon</h1>
          <button onClick={() => setLocation(null)} style={pageButtonStyle()}>
            Back to locations
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #0f766e 0%, #031323 24%, #020617 58%, #01030a 100%)',
        color: '#f8fafc',
        padding: 16,
      }}
    >
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <button onClick={() => setLocation(null)} style={{ ...pageButtonStyle(), marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ArrowLeft size={16} />
              Back to locations
            </button>

            <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
              FARMPLAST / NEW JERSEY
            </div>
            <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(30px, 4vw, 52px)', lineHeight: 1.02 }}>
              Plant HMI Dashboard
            </h1>
            <div style={{ color: '#cbd5e1', fontSize: 15 }}>
              Three chillers and one material barrel with animated industrial visualization
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 10, width: 'min(100%, 820px)' }}>
            <div style={statCardStyle()}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>TOTAL</div>
              <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900 }}>{summary.total}</div>
            </div>
            <div style={statCardStyle()}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ONLINE</div>
              <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, color: '#4ade80' }}>{summary.online}</div>
            </div>
            <div style={statCardStyle()}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>OFFLINE</div>
              <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, color: '#f87171' }}>{summary.offline}</div>
            </div>
            <div style={statCardStyle()}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>COMP ON</div>
              <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, color: '#38bdf8' }}>{summary.compressorsOn}</div>
            </div>
            <div style={statCardStyle()}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>BARREL</div>
              <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, color: '#facc15' }}>
                {summary.barrelLevel.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {useMockData ? (
          <div
            style={{
              ...statCardStyle(),
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#fde68a',
              border: '1px solid rgba(245, 158, 11, 0.24)',
            }}
          >
            <AlertTriangle size={18} />
            {error || 'Live data is unavailable. Demo values are shown so the page still looks complete.'}
          </div>
        ) : null}

        {loading ? (
          <div style={statCardStyle()}>Loading live dashboard…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr', gap: 18 }}>
            <div style={{ display: 'grid', gap: 18 }}>
              {chillers.map((asset) => (
                <ChillerIllustration
                  key={asset.asset_code}
                  asset={asset}
                  selected={selectedAsset?.asset_code === asset.asset_code}
                  onSelect={() => setSelectedAssetCode(asset.asset_code)}
                />
              ))}
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <DetailPanel asset={selectedAsset} />
              {barrel ? <BarrelIllustration asset={barrel} /> : <div style={statCardStyle()}>No barrel telemetry yet.</div>}

              <div style={statCardStyle()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 900, marginBottom: 12 }}>
                  <Wind size={16} />
                  System notes
                </div>
                <div style={{ display: 'grid', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
                  <div>• Blue line = chilled water circuit</div>
                  <div>• Red line = condenser / warm return circuit</div>
                  <div>• Fan animation indicates equipment communication is online</div>
                  <div>• Barrel graphic is driven by live percent value or demo fallback</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
