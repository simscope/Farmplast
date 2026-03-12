import React, { useEffect, useMemo, useState } from 'react'
import { MapPin, Factory, Thermometer, Waves, Package, Gauge, Activity, ArrowRight, Wifi, WifiOff, Snowflake, Droplets } from 'lucide-react'
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

function getPointValue(point) {
  if (point.data_type === 'boolean') return point.value_boolean
  if (point.data_type === 'number') return point.value_number
  return point.value_text
}

function formatValue(point) {
  if (point.data_type === 'boolean') return point.value_boolean ? 'ON' : 'OFF'
  if (point.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
    if (Number.isNaN(num)) return '—'
    if (point.unit === '%') return `${num.toFixed(1)}%`
    if (point.unit === 'mA') return `${num.toFixed(2)} mA`
    if (point.unit === 'F') return `${num.toFixed(1)}°F`
    return `${num.toFixed(1)}${point.unit ? ` ${point.unit}` : ''}`
  }
  return point.value_text || '—'
}

function getLatestTime(points) {
  let latest = null
  for (const p of points) {
    if (!p.updated_at) continue
    const d = new Date(p.updated_at)
    if (!latest || d > latest) latest = d
  }
  return latest
}

function getAssetStatus(points) {
  const latest = getLatestTime(points)
  if (!latest) return { online: false, label: 'OFFLINE' }
  const secondsAgo = Math.floor((Date.now() - latest.getTime()) / 1000)
  return { online: secondsAgo <= ONLINE_THRESHOLD_SEC, label: secondsAgo <= ONLINE_THRESHOLD_SEC ? 'ONLINE' : 'OFFLINE' }
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
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>SIM SCOPE / FARMPLAST</div>
          <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(34px, 5vw, 64px)', lineHeight: 1.02 }}>Choose production location</h1>
          <div style={{ color: '#cbd5e1', fontSize: 16 }}>Open plant overview with live industrial telemetry</div>
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
                border: loc.active ? '1px solid rgba(103,232,249,0.28)' : '1px solid rgba(148,163,184,0.14)',
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
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
                <div style={{ color: '#67e8f9', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>{loc.code}</div>
                <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{loc.title}</div>
                <div style={{ fontSize: 16, color: '#dbeafe', marginTop: 8 }}>{loc.subtitle}</div>
                <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 18, maxWidth: 400 }}>{loc.description}</div>
              </div>

              <div style={{ position: 'absolute', left: 26, bottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 14 }}>
                {loc.active ? 'Open dashboard' : 'Unavailable'}
                <ArrowRight size={18} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChillerHMI({ asset, selected, onSelect }) {
  const status = getAssetStatus(asset.points)
  const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
  const compressors = asset.points.filter((p) => p.point_group === 'compressors' || p.point_code.includes('COMP'))
  const plc = asset.points.filter((p) => p.point_group === 'plc')

  const tempMap = {
    condIn: temperatures.find((p) => p.point_code.includes('COND_WATER_IN')),
    condOut: temperatures.find((p) => p.point_code.includes('COND_WATER_OUT')),
    chwIn: temperatures.find((p) => p.point_code.includes('CHW_IN')),
    chwOut: temperatures.find((p) => p.point_code.includes('CHW_OUT')),
  }

  const activeComps = compressors.filter((p) => p.value_boolean === true).length

  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        border: selected ? '1px solid rgba(34,211,238,0.42)' : '1px solid rgba(148,163,184,0.14)',
        background: selected ? 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(8,47,73,0.96))' : 'rgba(15,23,42,0.82)',
        color: '#fff',
        borderRadius: 28,
        padding: 18,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: selected ? '0 16px 40px rgba(14,165,233,0.18)' : '0 10px 30px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10 }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{asset.asset_name}</div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div
        style={{
          position: 'relative',
          borderRadius: 22,
          border: '1px solid rgba(148,163,184,0.1)',
          background: 'linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.85))',
          padding: 18,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -12, top: -10, opacity: 0.08 }}>
          <Snowflake size={130} strokeWidth={1.2} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#cbd5e1', fontWeight: 800 }}>
              <Thermometer size={16} /> Water temperatures
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                ['Condenser In', tempMap.condIn],
                ['Condenser Out', tempMap.condOut],
                ['Chiller In', tempMap.chwIn],
                ['Chiller Out', tempMap.chwOut],
              ].map(([label, point]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(2,6,23,0.46)',
                    borderRadius: 14,
                    padding: '10px 12px',
                    border: '1px solid rgba(148,163,184,0.08)',
                  }}
                >
                  <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{label}</span>
                  <span style={{ color: '#f8fafc', fontSize: 15, fontWeight: 900 }}>{point ? formatValue(point) : '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#cbd5e1', fontWeight: 800 }}>
              <Activity size={16} /> Compressors
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {compressors.length ? compressors.map((point) => (
                <div
                  key={point.point_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: point.value_boolean ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    borderRadius: 14,
                    padding: '10px 12px',
                    border: `1px solid ${point.value_boolean ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.22)'}`,
                  }}
                >
                  <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                  <span style={{ color: point.value_boolean ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 900 }}>{formatValue(point)}</span>
                </div>
              )) : (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>No compressor points yet</div>
              )}
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 16, padding: 12, border: '1px solid rgba(148,163,184,0.08)' }}>
                <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>ACTIVE</div>
                <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900 }}>{activeComps}</div>
              </div>
              <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 16, padding: 12, border: '1px solid rgba(148,163,184,0.08)' }}>
                <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800 }}>PLC TAGS</div>
                <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900 }}>{plc.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function BarrelTank({ asset }) {
  const status = getAssetStatus(asset.points)
  const levelPercentPoint = asset.points.find((p) => p.point_code.includes('PERCENT'))
  const levelMaPoint = asset.points.find((p) => p.point_code.includes('_MA'))
  const levelPercent = Math.max(0, Math.min(100, Number(levelPercentPoint?.value_number ?? 0)))
  const fillColor = levelPercent < 20 ? '#ef4444' : levelPercent < 40 ? '#f59e0b' : '#22c55e'

  return (
    <div style={{ ...statCardStyle(), minHeight: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{asset.asset_name}</div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr', gap: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 180,
              height: 320,
              borderRadius: 34,
              border: '4px solid rgba(148,163,184,0.34)',
              position: 'relative',
              overflow: 'hidden',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))',
              boxShadow: 'inset 0 0 20px rgba(255,255,255,0.03)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: `${levelPercent}%`,
                background: `linear-gradient(180deg, ${fillColor}dd 0%, ${fillColor} 100%)`,
                transition: 'height 0.6s ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 18,
                  background: 'rgba(255,255,255,0.16)',
                  filter: 'blur(2px)',
                }}
              />
            </div>

            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <Package size={38} color="#e2e8f0" />
                <div style={{ marginTop: 10, fontWeight: 900, fontSize: 34 }}>{levelPercent.toFixed(1)}%</div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>Material level</div>
              </div>
            </div>
          </div>
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
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ asset }) {
  if (!asset) {
    return (
      <div style={{ ...statCardStyle(), minHeight: 480, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        Select a chiller to open HMI details.
      </div>
    )
  }

  const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
  const compressors = asset.points.filter((p) => p.point_group === 'compressors' || p.point_code.includes('COMP'))
  const plc = asset.points.filter((p) => p.point_group === 'plc')
  const status = getAssetStatus(asset.points)

  return (
    <div style={{ ...statCardStyle(), minHeight: 480 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>{asset.asset_name}</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>Industrial HMI-style live equipment view</div>
        </div>
        <StatusPill online={status.online} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
            <Droplets size={16} /> Water temperatures
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {temperatures.length ? temperatures.map((point) => (
              <div key={point.point_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 14, background: 'rgba(15,23,42,0.85)' }}>
                <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 700 }}>{point.point_name}</span>
                <span style={{ fontWeight: 900 }}>{formatValue(point)}</span>
              </div>
            )) : <div style={{ color: '#94a3b8' }}>No temperature points yet</div>}
          </div>
        </div>

        <div style={{ background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
            <Activity size={16} /> Compressor status
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {compressors.length ? compressors.map((point) => (
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
                <span style={{ fontWeight: 900, color: point.value_boolean ? '#4ade80' : '#f87171' }}>{formatValue(point)}</span>
              </div>
            )) : <div style={{ color: '#94a3b8' }}>No compressor points yet</div>}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, background: 'rgba(2,6,23,0.46)', borderRadius: 20, padding: 16, border: '1px solid rgba(148,163,184,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#cbd5e1', fontWeight: 900 }}>
          <Factory size={16} /> PLC / additional values
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {plc.length ? plc.map((point) => (
            <div key={point.point_id} style={{ background: 'rgba(15,23,42,0.85)', borderRadius: 14, padding: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{point.point_name}</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 18 }}>{formatValue(point)}</div>
            </div>
          )) : <div style={{ color: '#94a3b8' }}>PLC values will appear here automatically when points are added and telemetry starts coming in.</div>}
        </div>
      </div>
    </div>
  )
}

export default function FarmplastMonitoringPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [location, setLocation] = useState(null)
  const [selectedAssetCode, setSelectedAssetCode] = useState('CH-NJ-01')

  async function fetchData() {
    try {
      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) throw error

      setRows(data || [])
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to load monitoring data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const assets = useMemo(() => groupAssets(rows), [rows])
  const njAssets = useMemo(() => assets.filter((a) => a.asset_code.includes('-NJ-')), [assets])
  const chillers = useMemo(() => njAssets.filter((a) => a.asset_type === 'chiller'), [njAssets])
  const barrel = useMemo(() => njAssets.find((a) => a.asset_type === 'barrel'), [njAssets])
  const selectedAsset = useMemo(() => chillers.find((a) => a.asset_code === selectedAssetCode) || chillers[0] || null, [chillers, selectedAssetCode])

  const summary = useMemo(() => {
    const online = njAssets.filter((a) => getAssetStatus(a.points).online).length
    const offline = njAssets.length - online
    const compressorsOn = njAssets.flatMap((a) => a.points).filter((p) => (p.point_group === 'compressors' || p.point_code.includes('COMP')) && p.value_boolean === true).length
    return { total: njAssets.length, online, offline, compressorsOn }
  }, [njAssets])

  if (!location) return <LocationSelector onSelect={setLocation} />

  if (location === 'PA') {
    return (
      <div style={{ minHeight: '100vh', background: '#020617', color: '#fff', display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ ...statCardStyle(), maxWidth: 700, textAlign: 'center' }}>
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900 }}>PENNSYLVANIA</div>
          <h1 style={{ margin: '10px 0' }}>Dashboard coming soon</h1>
          <button onClick={() => setLocation(null)} style={{ marginTop: 10, border: 'none', background: '#0ea5e9', color: '#fff', padding: '12px 18px', borderRadius: 14, fontWeight: 800, cursor: 'pointer' }}>
            Back to locations
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top, #0f766e 0%, #031323 30%, #020617 60%, #01030a 100%)', color: '#f8fafc', padding: 16 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <button onClick={() => setLocation(null)} style={{ border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(15,23,42,0.74)', color: '#cbd5e1', borderRadius: 14, padding: '10px 14px', cursor: 'pointer', fontWeight: 800, marginBottom: 14 }}>
              ← Back to locations
            </button>
            <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>FARMPLAST / NEW JERSEY</div>
            <h1 style={{ margin: '8px 0 8px', fontSize: 'clamp(30px, 4vw, 52px)', lineHeight: 1.02 }}>Plant HMI Dashboard</h1>
            <div style={{ color: '#cbd5e1', fontSize: 15 }}>Three chillers and one material barrel with live level animation</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: 10, width: 'min(100%, 640px)' }}>
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
          </div>
        </div>

        {loading ? (
          <div style={statCardStyle()}>Loading live dashboard…</div>
        ) : error ? (
          <div style={{ ...statCardStyle(), color: '#fecaca', border: '1px solid rgba(239,68,68,0.3)' }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 0.95fr', gap: 18 }}>
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gap: 14 }}>
                {chillers.map((asset) => (
                  <ChillerHMI
                    key={asset.asset_code}
                    asset={asset}
                    selected={selectedAsset?.asset_code === asset.asset_code}
                    onSelect={() => setSelectedAssetCode(asset.asset_code)}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <DetailPanel asset={selectedAsset} />
              {barrel ? <BarrelTank asset={barrel} /> : <div style={statCardStyle()}>No barrel telemetry yet.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
