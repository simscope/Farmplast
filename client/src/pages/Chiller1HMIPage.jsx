import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Thermometer,
  Gauge,
  Power,
  Settings,
  Activity,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  POLL_INTERVAL_MS,
  normalizeRow,
  groupAssets,
  getAssetStatus,
  pageButtonStyle,
  statCardStyle,
} from '../utils/monitoringHelpers'

function useViewport() {
  const getWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1440)
  const [width, setWidth] = useState(getWidth)

  useEffect(() => {
    function onResize() {
      setWidth(getWidth())
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1200,
    isDesktop: width >= 1200,
  }
}

function toText(v) {
  return String(v || '').toUpperCase().trim()
}

function parseNumericValue(point) {
  const candidates = [
    point?.value_number,
    point?.value,
    point?.current_value,
    point?.reading,
    point?.raw_value,
    point?.display_value,
    point?.value_text,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && !Number.isNaN(candidate)) return candidate
    if (typeof candidate === 'string') {
      const cleaned = candidate.replace(/[^\d.-]/g, '')
      const parsed = Number(cleaned)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  return null
}

function buildSearchText(point) {
  return [
    point?.point_code,
    point?.point_name,
    point?.name,
    point?.label,
    point?.description,
    point?.display_name,
  ]
    .map((x) => toText(x))
    .join(' | ')
}

function findPointByAliases(points, aliases) {
  const normalizedAliases = aliases.map((a) => toText(a))
  return points.find((point) => {
    const text = buildSearchText(point)
    return normalizedAliases.some((alias) => text.includes(alias))
  })
}

function getTemperature(points, aliases, fallback = null) {
  const point = findPointByAliases(points, aliases)
  const parsed = parseNumericValue(point)
  return parsed ?? fallback
}

function getBoolean(points, aliases) {
  const point = findPointByAliases(points, aliases)
  const raw = point?.value_boolean

  if (typeof raw === 'boolean') return raw

  const parsed = parseNumericValue(point)
  if (parsed === 1) return true
  if (parsed === 0) return false

  const text = toText(
    point?.value_text ?? point?.value ?? point?.display_value ?? point?.raw_value
  )

  if (['ON', 'RUN', 'TRUE', 'ACTIVE', 'ENABLE', 'ENABLED'].includes(text)) return true
  if (['OFF', 'STOP', 'FALSE', 'INACTIVE', 'DISABLE', 'DISABLED'].includes(text)) return false

  return false
}

function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function HMIValueCard({ title, value, unit = '', accent = 'cyan', subtitle = '' }) {
  const tones = {
    cyan: {
      border: 'rgba(34,211,238,0.28)',
      bg: 'rgba(8,47,73,0.22)',
      title: '#67e8f9',
      value: '#e0f2fe',
    },
    red: {
      border: 'rgba(248,113,113,0.28)',
      bg: 'rgba(127,29,29,0.22)',
      title: '#fca5a5',
      value: '#fecaca',
    },
    green: {
      border: 'rgba(74,222,128,0.28)',
      bg: 'rgba(20,83,45,0.22)',
      title: '#86efac',
      value: '#dcfce7',
    },
    yellow: {
      border: 'rgba(250,204,21,0.28)',
      bg: 'rgba(113,63,18,0.22)',
      title: '#facc15',
      value: '#fef3c7',
    },
    slate: {
      border: 'rgba(148,163,184,0.22)',
      bg: 'rgba(15,23,42,0.48)',
      title: '#cbd5e1',
      value: '#f8fafc',
    },
  }

  const t = tones[accent] || tones.cyan

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        background: t.bg,
        borderRadius: 22,
        padding: '16px 18px',
        minHeight: 112,
      }}
    >
      <div style={{ color: t.title, fontSize: 12, fontWeight: 900, letterSpacing: 0.9 }}>
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          color: t.value,
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 900,
        }}
      >
        {value}
        {unit ? <span style={{ marginLeft: 4 }}>{unit}</span> : null}
      </div>

      {subtitle ? (
        <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}

function HMIBadge({ children, tone = 'slate' }) {
  const styles = {
    slate: {
      border: '1px solid rgba(148,163,184,0.22)',
      background: 'rgba(255,255,255,0.04)',
      color: '#e2e8f0',
    },
    green: {
      border: '1px solid rgba(74,222,128,0.28)',
      background: 'rgba(20,83,45,0.22)',
      color: '#86efac',
    },
    red: {
      border: '1px solid rgba(248,113,113,0.30)',
      background: 'rgba(127,29,29,0.22)',
      color: '#fca5a5',
    },
    yellow: {
      border: '1px solid rgba(250,204,21,0.28)',
      background: 'rgba(113,63,18,0.22)',
      color: '#fde68a',
    },
    cyan: {
      border: '1px solid rgba(34,211,238,0.28)',
      background: 'rgba(8,47,73,0.22)',
      color: '#67e8f9',
    },
  }

  return (
    <div
      style={{
        ...styles[tone],
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function CompressorStatus({ label, active }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: '14px 16px',
        border: active
          ? '1px solid rgba(74,222,128,0.28)'
          : '1px solid rgba(148,163,184,0.18)',
        background: active ? 'rgba(20,83,45,0.22)' : 'rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{label}</div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: active ? '#86efac' : '#94a3b8',
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: active ? '#22c55e' : '#64748b',
            boxShadow: active ? '0 0 12px rgba(34,197,94,0.7)' : 'none',
          }}
        />
        {active ? 'RUN' : 'STOP'}
      </div>
    </div>
  )
}

function HMIButton({ icon, label, active = false, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        borderRadius: 18,
        border: active
          ? '1px solid rgba(34,211,238,0.32)'
          : '1px solid rgba(148,163,184,0.18)',
        background: active ? 'rgba(8,47,73,0.28)' : 'rgba(255,255,255,0.04)',
        color: disabled ? '#64748b' : '#e2e8f0',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

export default function Chiller1HMIPage() {
  const navigate = useNavigate()
  const { isMobile, isDesktop } = useViewport()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function fetchData({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true)

      const { data, error: fetchError } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .eq('asset_code', 'CH-NJ-01')
        .order('display_order', { ascending: true })

      if (fetchError) throw fetchError

      const normalized = Array.isArray(data) ? data.map(normalizeRow) : []
      setRows(normalized)

      if (!normalized.length) {
        setError('No live telemetry rows returned for CH-NJ-01.')
      } else {
        setError('')
      }
    } catch (err) {
      setRows([])
      setError(err?.message || 'Failed to load CH-NJ-01 telemetry.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    const timer = setInterval(() => {
      fetchData({ silent: true })
    }, POLL_INTERVAL_MS)

    const latestChannel = supabase
      .channel('monitoring-ch1-hmi')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_latest',
        },
        () => {
          fetchData({ silent: true })
        }
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(latestChannel)
    }
  }, [])

  const assets = useMemo(() => groupAssets(rows), [rows])

  const asset = useMemo(() => {
    return assets.find((item) => String(item.asset_code || '').toUpperCase() === 'CH-NJ-01') || null
  }, [assets])

  const points = Array.isArray(asset?.points) ? asset.points : []
  const status = getAssetStatus(asset || {})
  const online = !!status?.online
  const alarm = !!status?.alarm

  const chwIn = getTemperature(points, [
    'ECHW',
    'CHILLED WATER IN',
    'CHW IN',
    'ENTERING CHILLED WATER',
    'EVAP WATER IN',
    'ENTERING FLUID TEMP',
    'CH1_CHW_IN',
  ])

  const chwOut = getTemperature(points, [
    'LCHW',
    'CHILLED WATER OUT',
    'CHW OUT',
    'LEAVING CHILLED WATER',
    'EVAP WATER OUT',
    'LEAVING FLUID TEMP',
    'CH1_CHW_OUT',
  ])

  const condIn = getTemperature(points, [
    'ECW',
    'CONDENSER WATER IN',
    'COND IN',
    'ENTERING CONDENSER WATER',
    'CH1_COND_WATER_IN',
  ])

  const condOut = getTemperature(points, [
    'LCW',
    'CONDENSER WATER OUT',
    'COND OUT',
    'LEAVING CONDENSER WATER',
    'CH1_COND_WATER_OUT',
  ])

  const compressorA = getBoolean(points, [
    'COMPRESSOR A',
    'COMP A',
    'COMP_A',
    'COMP-A',
    'COMP1',
    'COMP 1',
    'CH1_COMP_A_STATUS',
    'COMP_A_STATUS',
  ])

  const compressorB = getBoolean(points, [
    'COMPRESSOR B',
    'COMP B',
    'COMP_B',
    'COMP-B',
    'COMP2',
    'COMP 2',
    'CH1_COMP_B_STATUS',
    'COMP_B_STATUS',
  ])

  const setpoint = getTemperature(points, [
    'SETPOINT',
    'SET POINT',
    'LEAVING WATER SETPOINT',
    'CHW SETPOINT',
    'COOLING SETPOINT',
    'CH1_SETPOINT',
  ])

  const leavingDiff =
    chwIn !== null && chwOut !== null ? Number(chwIn) - Number(chwOut) : null

  const pagePadding = isMobile ? 12 : 18

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, #0f766e 0%, #031323 24%, #020617 58%, #01030a 100%)',
        color: '#f8fafc',
        padding: pagePadding,
      }}
    >
      <div style={{ maxWidth: 1650, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <button
              onClick={() => navigate('/monitoring/nj')}
              style={{
                ...pageButtonStyle(true, isMobile),
                marginBottom: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ArrowLeft size={16} />
              Back to NJ dashboard
            </button>

            <div
              style={{
                color: '#67e8f9',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 1.2,
              }}
            >
              FARMPLAST / NEW JERSEY / HMI
            </div>

            <h1
              style={{
                margin: '8px 0 8px',
                fontSize: isMobile ? 28 : 'clamp(30px, 4vw, 52px)',
                lineHeight: 1.02,
              }}
            >
              Chiller 1 HMI
            </h1>

            <div style={{ color: '#cbd5e1', fontSize: isMobile ? 14 : 15 }}>
              Live overview, compressor status, temperatures and operator controls
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <HMIBadge tone={online ? 'green' : 'red'}>
              {online ? 'Online' : 'Offline'}
            </HMIBadge>
            <HMIBadge tone={alarm ? 'red' : 'slate'}>
              {alarm ? 'Alarm active' : 'Normal'}
            </HMIBadge>
            <HMIBadge tone="cyan">{asset?.asset_code || 'CH-NJ-01'}</HMIBadge>
          </div>
        </div>

        {error ? (
          <div
            style={{
              ...statCardStyle(isMobile),
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#fecaca',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              background: 'rgba(127, 29, 29, 0.22)',
            }}
          >
            <AlertTriangle size={18} />
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={statCardStyle(isMobile)}>Loading Chiller 1 HMI…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? '1.35fr 0.9fr' : '1fr',
              gap: 18,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 18 }}>
              <div
                style={{
                  borderRadius: 28,
                  border: alarm
                    ? '1px solid rgba(248,113,113,0.30)'
                    : '1px solid rgba(56,189,248,0.22)',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: isMobile ? 16 : 20 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(320px, 1fr) 1fr',
                      gap: 16,
                      alignItems: 'stretch',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 16 }}>
                      <HMIValueCard
                        title="CHW IN"
                        value={fmtNumber(chwIn, 1)}
                        unit="°F"
                        accent="cyan"
                        subtitle="entering chilled water"
                      />
                      <HMIValueCard
                        title="COND IN"
                        value={fmtNumber(condIn, 1)}
                        unit="°F"
                        accent="red"
                        subtitle="entering condenser water"
                      />
                    </div>

                    <div
                      style={{
                        minHeight: isMobile ? 260 : 330,
                        borderRadius: 26,
                        border: '1px solid rgba(56,189,248,0.14)',
                        background:
                          'radial-gradient(circle at center, rgba(59,130,246,0.12) 0%, rgba(15,23,42,0.4) 60%, rgba(2,6,23,0.72) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 18,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 240,
                          borderRadius: 24,
                          border: '1px solid rgba(250,204,21,0.28)',
                          background: 'rgba(113,63,18,0.18)',
                          padding: '18px 16px',
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            color: '#facc15',
                            fontSize: 12,
                            fontWeight: 900,
                            letterSpacing: 1,
                          }}
                        >
                          SETPOINT
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            fontSize: isMobile ? 38 : 48,
                            lineHeight: 1,
                            fontWeight: 900,
                            color: '#fde68a',
                          }}
                        >
                          {setpoint === null ? '—' : Number(setpoint).toFixed(1)}
                          {setpoint === null ? null : <span style={{ marginLeft: 4 }}>°F</span>}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 18,
                          width: '100%',
                          display: 'grid',
                          gridTemplateColumns: '1fr',
                          gap: 12,
                          maxWidth: 320,
                        }}
                      >
                        <CompressorStatus label="Compressor A" active={compressorA} />
                        <CompressorStatus label="Compressor B" active={compressorB} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 16 }}>
                      <HMIValueCard
                        title="CHW OUT"
                        value={fmtNumber(chwOut, 1)}
                        unit="°F"
                        accent="cyan"
                        subtitle="leaving chilled water"
                      />
                      <HMIValueCard
                        title="COND OUT"
                        value={fmtNumber(condOut, 1)}
                        unit="°F"
                        accent="red"
                        subtitle="leaving condenser water"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 28,
                  border: '1px solid rgba(56,189,248,0.22)',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: isMobile ? 16 : 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Settings size={18} />
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Operator panel</div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                      gap: 12,
                    }}
                  >
                    <HMIButton icon={<Power size={16} />} label="Start" disabled />
                    <HMIButton icon={<Power size={16} />} label="Stop" disabled />
                    <HMIButton icon={<Settings size={16} />} label="Auto" active disabled />
                    <HMIButton icon={<Settings size={16} />} label="Manual" disabled />
                  </div>

                  <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 13 }}>
                    Buttons are visual only for now. We are only reading telemetry at this stage.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <div
                style={{
                  borderRadius: 28,
                  border: '1px solid rgba(56,189,248,0.22)',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: isMobile ? 16 : 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Activity size={18} />
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Quick values</div>
                  </div>

                  <div style={{ display: 'grid', gap: 14 }}>
                    <HMIValueCard
                      title="ONLINE STATUS"
                      value={online ? 'ONLINE' : 'OFFLINE'}
                      accent={online ? 'green' : 'red'}
                    />
                    <HMIValueCard
                      title="ALARM STATUS"
                      value={alarm ? 'ALARM' : 'NORMAL'}
                      accent={alarm ? 'red' : 'green'}
                    />
                    <HMIValueCard
                      title="ΔT CHW"
                      value={leavingDiff === null ? '—' : Number(leavingDiff).toFixed(1)}
                      unit={leavingDiff === null ? '' : '°F'}
                      accent="yellow"
                      subtitle="CHW IN - CHW OUT"
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 28,
                  border: '1px solid rgba(56,189,248,0.22)',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: isMobile ? 16 : 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Thermometer size={18} />
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Water circuit</div>
                  </div>

                  <div style={{ display: 'grid', gap: 14 }}>
                    <HMIValueCard title="CHW IN" value={fmtNumber(chwIn, 1)} unit="°F" accent="cyan" />
                    <HMIValueCard title="CHW OUT" value={fmtNumber(chwOut, 1)} unit="°F" accent="cyan" />
                    <HMIValueCard title="COND IN" value={fmtNumber(condIn, 1)} unit="°F" accent="red" />
                    <HMIValueCard title="COND OUT" value={fmtNumber(condOut, 1)} unit="°F" accent="red" />
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 28,
                  border: '1px solid rgba(56,189,248,0.22)',
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
                  boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: isMobile ? 16 : 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <Gauge size={18} />
                    <div style={{ fontSize: 18, fontWeight: 900 }}>Compressor panel</div>
                  </div>

                  <div style={{ display: 'grid', gap: 12 }}>
                    <CompressorStatus label="Compressor A" active={compressorA} />
                    <CompressorStatus label="Compressor B" active={compressorB} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
