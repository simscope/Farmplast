import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Droplets,
  Gauge,
  Package,
  Waves,
  Wifi,
  WifiOff,
  Wind,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 5000
const ONLINE_THRESHOLD_SEC = 90

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
    asset_id: '4',
    asset_code: 'BARREL-NJ-01',
    asset_name: 'Material Barrel 1',
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
    asset_code: 'BARREL-NJ-01',
    asset_name: 'Material Barrel 1',
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
    point_id: row.point_id,
    point_code: row.point_code,
    point_name: row.point_name,
    point_group: row.point_group,
    data_type: row.data_type,
    value_number:
      row.value_number === null || row.value_number === undefined
        ? null
        : Number(row.value_number),
    value_boolean:
      row.value_boolean === null || row.value_boolean === undefined
        ? null
        : row.value_boolean,
    value_text: row.value_text,
    unit: row.unit || '',
    updated_at: row.updated_at,
    display_order: row.display_order ?? 0,
  }
}

function formatValue(point) {
  if (point?.data_type === 'boolean') return point.value_boolean ? 'ON' : 'OFF'
  if (point?.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
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

export default function MonitoringNJPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [useMockData, setUseMockData] = useState(false)

  async function fetchData() {
    try {
      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) throw error

      if (!data || !data.length) {
        setRows(mockRows)
        setUseMockData(true)
        setError('Supabase returned no rows. Showing demo visualization.')
      } else {
        setRows(data.map(normalizeRow))
        setUseMockData(false)
        setError(null)
      }
    } catch (err) {
      setRows(mockRows)
      setUseMockData(true)
      setError(err?.message || 'Live telemetry unavailable. Showing demo visualization.')
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
  const njAssets = useMemo(
    () => assets.filter((a) => String(a.asset_code || '').includes('-NJ-')),
    [assets]
  )
  const chillers = useMemo(
    () => njAssets.filter((a) => String(a.asset_type || '').toLowerCase() === 'chiller'),
    [njAssets]
  )
  const barrel = useMemo(
    () => njAssets.find((a) => String(a.asset_type || '').toLowerCase() === 'barrel'),
    [njAssets]
  )

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
        <button
          onClick={() => {
            window.location.href = '/'
          }}
          style={{
            marginBottom: 18,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(8,47,73,0.84)',
            color: '#e2e8f0',
            borderRadius: 16,
            padding: '10px 14px',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
            FARMPLAST / NEW JERSEY
          </div>
          <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(30px, 4vw, 52px)', lineHeight: 1.02 }}>
            Plant HMI Dashboard
          </h1>
        </div>

        {useMockData ? (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.82)',
              border: '1px solid rgba(245, 158, 11, 0.24)',
              borderRadius: 24,
              padding: 18,
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#fde68a',
            }}
          >
            <AlertTriangle size={18} />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            {chillers.map((asset) => {
              const status = getAssetStatus(asset.points)
              const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
              const compressors = asset.points.filter((p) => p.point_group === 'compressors')

              return (
                <div
                  key={asset.asset_code}
                  style={{
                    background: 'rgba(15, 23, 42, 0.82)',
                    border: '1px solid rgba(148, 163, 184, 0.14)',
                    borderRadius: 24,
                    padding: 18,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
                      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900 }}>{asset.asset_name}</div>
                    </div>
                    <StatusPill online={status.online} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                    <div>
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
                              padding: '10px 12px',
                              borderRadius: 14,
                              background: 'rgba(15,23,42,0.85)',
                            }}
                          >
                            <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                            <span style={{ fontWeight: 900 }}>{formatValue(point)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
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
            })}

            {barrel ? (
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.82)',
                  border: '1px solid rgba(148, 163, 184, 0.14)',
                  borderRadius: 24,
                  padding: 18,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{barrel.asset_code}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{barrel.asset_name}</div>
                  </div>
                  <StatusPill online={getAssetStatus(barrel.points).online} />
                </div>

                <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  {barrel.points.map((point) => (
                    <div
                      key={point.point_id}
                      style={{
                        background: 'rgba(2,6,23,0.46)',
                        borderRadius: 18,
                        padding: 14,
                        border: '1px solid rgba(148,163,184,0.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 800 }}>
                        {point.point_code.includes('MA') ? <Gauge size={16} /> : <Package size={16} />}
                        {point.point_name}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>{formatValue(point)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.82)',
                border: '1px solid rgba(148, 163, 184, 0.14)',
                borderRadius: 24,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontWeight: 900, marginBottom: 12 }}>
                <Wind size={16} />
                System notes
              </div>
              <div style={{ display: 'grid', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
                <div>• Blue line = chilled water circuit</div>
                <div>• Red line = condenser / warm return circuit</div>
                <div>• Online/offline is based on latest telemetry timestamp</div>
                <div>• Data source = Supabase view v_asset_points_latest</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
