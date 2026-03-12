import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 10000
const ONLINE_THRESHOLD_SEC = 90

function formatValue(point) {
  if (point.data_type === 'boolean') {
    return point.value_boolean ? 'ON' : 'OFF'
  }

  if (point.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
    if (Number.isNaN(num)) return '—'

    if (point.unit === '%') return `${num.toFixed(1)}%`
    if (point.unit === 'mA') return `${num.toFixed(2)} mA`
    if (point.unit === 'F') return `${num.toFixed(1)}°F`

    return `${num.toFixed(1)}${point.unit ? ` ${point.unit}` : ''}`
  }

  if (point.data_type === 'text') {
    return point.value_text || '—'
  }

  return '—'
}

function getPointRawValue(point) {
  if (point.data_type === 'boolean') return point.value_boolean
  if (point.data_type === 'number') return point.value_number
  if (point.data_type === 'text') return point.value_text
  return null
}

function getAssetLastUpdated(points) {
  let latest = null

  for (const point of points) {
    if (!point.updated_at) continue
    const date = new Date(point.updated_at)
    if (!latest || date > latest) latest = date
  }

  return latest
}

function getOnlineStatus(points) {
  const lastUpdated = getAssetLastUpdated(points)
  if (!lastUpdated) return { label: 'OFFLINE', color: '#ef4444', secondsAgo: null }

  const secondsAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)

  if (secondsAgo <= ONLINE_THRESHOLD_SEC) {
    return { label: 'ONLINE', color: '#22c55e', secondsAgo }
  }

  return { label: 'OFFLINE', color: '#ef4444', secondsAgo }
}

function formatTimeAgo(points) {
  const lastUpdated = getAssetLastUpdated(points)
  if (!lastUpdated) return 'No data'

  const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function groupAssetData(rows) {
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

  return Object.values(grouped).map((asset) => {
    const sortedPoints = [...asset.points].sort((a, b) => {
      const aOrder = a.display_order ?? 0
      const bOrder = b.display_order ?? 0
      return aOrder - bOrder
    })

    return {
      ...asset,
      points: sortedPoints,
    }
  })
}

function getChillerSections(points) {
  const compressors = points.filter((p) => p.point_group === 'compressors')
  const temperatures = points.filter((p) => p.point_group === 'temperatures')
  const plc = points.filter((p) => p.point_group === 'plc')
  const level = points.filter((p) => p.point_group === 'level')

  return { compressors, temperatures, plc, level }
}

function StatusBadge({ label, color }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 999,
        background: `${color}20`,
        color,
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 0.4,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  )
}

function PointRow({ point }) {
  const isBoolean = point.data_type === 'boolean'
  const boolOn = point.value_boolean === true

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        background: '#111827',
        border: '1px solid #1f2937',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: '#cbd5e1',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {point.point_name}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {point.point_code}
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: isBoolean ? (boolOn ? '#22c55e' : '#ef4444') : '#f8fafc',
          whiteSpace: 'nowrap',
        }}
      >
        {formatValue(point)}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: '#94a3b8',
          marginBottom: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </div>
  )
}

function AssetCard({ asset }) {
  const status = getOnlineStatus(asset.points)
  const lastSeenText = formatTimeAgo(asset.points)
  const { compressors, temperatures, plc, level } = getChillerSections(asset.points)

  const isBarrel = asset.asset_type === 'barrel'
  const isChiller = asset.asset_type === 'chiller'

  const barrelPercentPoint = level.find((p) => p.point_code.includes('PERCENT'))
  const barrelPercent = barrelPercentPoint?.value_number ?? 0

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 18,
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
            {asset.asset_code}
          </div>
          <div style={{ fontSize: 22, color: '#f8fafc', fontWeight: 800, marginTop: 4 }}>
            {asset.asset_name}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
            Last update: {lastSeenText}
          </div>
        </div>

        <StatusBadge label={status.label} color={status.color} />
      </div>

      {isChiller && compressors.length > 0 && (
        <Section title="Compressors">
          {compressors.map((point) => (
            <PointRow key={point.point_id} point={point} />
          ))}
        </Section>
      )}

      {isChiller && temperatures.length > 0 && (
        <Section title="Temperatures">
          {temperatures.map((point) => (
            <PointRow key={point.point_id} point={point} />
          ))}
        </Section>
      )}

      {isChiller && plc.length > 0 && (
        <Section title="PLC Data">
          {plc.map((point) => (
            <PointRow key={point.point_id} point={point} />
          ))}
        </Section>
      )}

      {isBarrel && (
        <>
          <Section title="Material Level">
            {level.map((point) => (
              <PointRow key={point.point_id} point={point} />
            ))}
          </Section>

          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontSize: 13,
                color: '#cbd5e1',
                fontWeight: 700,
              }}
            >
              <span>Level</span>
              <span>{Number(barrelPercent || 0).toFixed(1)}%</span>
            </div>

            <div
              style={{
                width: '100%',
                height: 16,
                background: '#111827',
                borderRadius: 999,
                overflow: 'hidden',
                border: '1px solid #1f2937',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, Number(barrelPercent || 0)))}%`,
                  height: '100%',
                  background:
                    Number(barrelPercent || 0) < 20
                      ? '#ef4444'
                      : Number(barrelPercent || 0) < 40
                      ? '#f59e0b'
                      : '#22c55e',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function DeviceMonitoringPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      else setRefreshing(true)

      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) throw error

      setRows(data || [])
      setError(null)
    } catch (err) {
      console.error('Device monitoring fetch error:', err)
      setError(err.message || 'Failed to load monitoring data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData(true)

    const timer = setInterval(() => {
      fetchData(false)
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [])

  const assets = useMemo(() => groupAssetData(rows), [rows])

  const summary = useMemo(() => {
    let onlineCount = 0
    let offlineCount = 0
    let compressorOnCount = 0

    for (const asset of assets) {
      const status = getOnlineStatus(asset.points)
      if (status.label === 'ONLINE') onlineCount++
      else offlineCount++

      for (const point of asset.points) {
        if (point.point_group === 'compressors' && point.value_boolean === true) {
          compressorOnCount++
        }
      }
    }

    return {
      totalAssets: assets.length,
      onlineCount,
      offlineCount,
      compressorOnCount,
    }
  }, [assets])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#f8fafc',
        padding: 16,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#38bdf8', fontWeight: 800, letterSpacing: 1 }}>
              FARMPLAST / NJ
            </div>
            <h1
              style={{
                margin: '6px 0 8px',
                fontSize: 'clamp(26px, 4vw, 40px)',
                lineHeight: 1.1,
              }}
            >
              Device Monitoring
            </h1>
            <div style={{ color: '#94a3b8', fontSize: 14 }}>
              Chillers, compressors, PLC data and barrel level
            </div>
          </div>

          <button
            onClick={() => fetchData(false)}
            disabled={refreshing}
            style={{
              background: '#0ea5e9',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 16px',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: 120,
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>TOTAL ASSETS</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{summary.totalAssets}</div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>ONLINE</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#22c55e' }}>
              {summary.onlineCount}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>OFFLINE</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#ef4444' }}>
              {summary.offlineCount}
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>COMPRESSORS ON</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#38bdf8' }}>
              {summary.compressorOnCount}
            </div>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 20,
              padding: 24,
              color: '#94a3b8',
            }}
          >
            Loading monitoring data...
          </div>
        ) : error ? (
          <div
            style={{
              background: '#450a0a',
              border: '1px solid #7f1d1d',
              borderRadius: 20,
              padding: 24,
              color: '#fecaca',
            }}
          >
            {error}
          </div>
        ) : assets.length === 0 ? (
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 20,
              padding: 24,
              color: '#94a3b8',
            }}
          >
            No monitoring data yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {assets.map((asset) => (
              <AssetCard key={asset.asset_code} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
