import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ChillerIllustration from '../components/monitoring/ChillerIllustration'
import BarrelIllustration from '../components/monitoring/BarrelIllustration'
import {
  POLL_INTERVAL_MS,
  normalizeRow,
  groupAssets,
  getAssetStatus,
  statCardStyle,
  pageButtonStyle,
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

function barrelSort(a, b) {
  const codeA = String(a?.asset_code || '')
  const codeB = String(b?.asset_code || '')
  return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' })
}

function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const num = Number(value)
    if (!Number.isNaN(num)) return num
  }
  return null
}

function getCh2Setpoint(row) {
  return firstNumber(
    row?.setpoint_f,
    row?.set_point_f,
    row?.evap_setpoint_f,
    row?.evap_set_point_f,
    row?.leaving_setpoint_f,
    row?.leaving_set_point_f,
    row?.process_setpoint_f,
    row?.process_set_point_f,
    row?.setpoint,
    row?.set_point
  )
}

function SmallMetric({ title, value, unit, subtitle, accent = 'cyan' }) {
  const border =
    accent === 'red'
      ? 'rgba(251,113,133,0.28)'
      : accent === 'green'
        ? 'rgba(52,211,153,0.28)'
        : accent === 'yellow'
          ? 'rgba(250,204,21,0.28)'
          : 'rgba(34,211,238,0.28)'

  const glow =
    accent === 'red'
      ? 'rgba(127,29,29,0.22)'
      : accent === 'green'
        ? 'rgba(6,78,59,0.22)'
        : accent === 'yellow'
          ? 'rgba(113,63,18,0.22)'
          : 'rgba(8,47,73,0.22)'

  const valueColor =
    accent === 'red'
      ? '#fda4af'
      : accent === 'green'
        ? '#86efac'
        : accent === 'yellow'
          ? '#fde68a'
          : '#93c5fd'

  const titleColor =
    accent === 'red'
      ? '#fca5a5'
      : accent === 'green'
        ? '#86efac'
        : accent === 'yellow'
          ? '#facc15'
          : '#67e8f9'

  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: glow,
        borderRadius: 22,
        padding: '16px 18px',
        minHeight: 108,
      }}
    >
      <div style={{ color: titleColor, fontSize: 13, fontWeight: 900, letterSpacing: 0.8 }}>
        {title}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 900,
          color: valueColor,
        }}
      >
        {value}
        {unit ? <span style={{ marginLeft: 2 }}>{unit}</span> : null}
      </div>

      {subtitle ? (
        <div style={{ marginTop: 8, fontSize: 14, color: '#94a3b8' }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

function Badge({ children, tone = 'slate' }) {
  const styles = {
    slate: {
      border: '1px solid rgba(148,163,184,0.20)',
      background: 'rgba(255,255,255,0.05)',
      color: '#e2e8f0',
    },
    red: {
      border: '1px solid rgba(248,113,113,0.28)',
      background: 'rgba(127,29,29,0.22)',
      color: '#fca5a5',
    },
    green: {
      border: '1px solid rgba(74,222,128,0.28)',
      background: 'rgba(20,83,45,0.22)',
      color: '#86efac',
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
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function StatusDot({ active, label }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '8px 12px',
        border: active ? '1px solid rgba(74,222,128,0.28)' : '1px solid rgba(148,163,184,0.18)',
        background: active ? 'rgba(20,83,45,0.22)' : 'rgba(255,255,255,0.04)',
        color: active ? '#86efac' : '#cbd5e1',
        fontSize: 13,
        fontWeight: 700,
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
      {label}
    </div>
  )
}

function Chiller2DashboardCard({ row, isMobile, onClick }) {
  const online = !!row?.is_online
  const hasAlarm = !!row?.alarm_active || !!row?.has_alarm || !!row?.alert_active
  const setpoint = getCh2Setpoint(row)

  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        borderRadius: 28,
        border: '1px solid rgba(56,189,248,0.22)',
        background:
          'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
        boxShadow: '0 0 0 1px rgba(96,165,250,0.06) inset, 0 20px 50px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: isMobile ? 18 : 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: '#67e8f9',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 1,
              }}
            >
              CHILLER
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: isMobile ? 28 : 40,
                lineHeight: 1,
                fontWeight: 900,
              }}
            >
              Chiller 2
            </div>

            <div style={{ marginTop: 10, fontSize: 14, color: '#cbd5e1' }}>
              {row?.asset_code || 'CH-NJ-02'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={online ? 'green' : 'red'}>{online ? 'Online' : 'Offline'}</Badge>
            <Badge tone={hasAlarm ? 'red' : 'slate'}>{hasAlarm ? 'Alarm' : 'Normal'}</Badge>
          </div>
        </div>

        <div
          style={{
            borderRadius: 24,
            border: '1px solid rgba(56,189,248,0.14)',
            background: 'rgba(15, 23, 42, 0.32)',
            padding: isMobile ? 16 : 18,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(280px, 0.9fr) 1fr',
              gap: 16,
              alignItems: 'stretch',
            }}
          >
            <div style={{ display: 'grid', gap: 16 }}>
              <SmallMetric
                title="CHILLER IN 1"
                value={fmtNumber(row?.chiller_entering_f, 1)}
                unit="°F"
                subtitle="section 1 entering fluid"
                accent="cyan"
              />

              <SmallMetric
                title="CHILLER IN 2"
                value={fmtNumber(row?.chiller_entering_f, 1)}
                unit="°F"
                subtitle="section 2 entering fluid"
                accent="cyan"
              />
            </div>

            <div
              style={{
                minHeight: isMobile ? 220 : 260,
                borderRadius: 24,
                border: '1px solid rgba(56,189,248,0.14)',
                background:
                  'radial-gradient(circle at center, rgba(59,130,246,0.12) 0%, rgba(15,23,42,0.4) 60%, rgba(2,6,23,0.72) 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 220,
                  borderRadius: 24,
                  border: '1px solid rgba(250,204,21,0.28)',
                  background: 'rgba(113,63,18,0.18)',
                  padding: '20px 16px',
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
                    fontSize: isMobile ? 36 : 44,
                    lineHeight: 1,
                    fontWeight: 900,
                    color: '#fde68a',
                  }}
                >
                  {setpoint === null ? '—' : setpoint.toFixed(1)}
                  {setpoint === null ? null : <span style={{ marginLeft: 4 }}>°F</span>}
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#94a3b8',
                  letterSpacing: 0.4,
                }}
              >
                COMPRESSOR SECTIONS
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(54px, 1fr))',
                  gap: 10,
                  width: '100%',
                  maxWidth: 240,
                }}
              >
                <StatusDot active={!!row?.comp_1a_enabled} label="1A" />
                <StatusDot active={!!row?.comp_1b_enabled} label="1B" />
                <StatusDot active={!!row?.comp_1c_enabled} label="1C" />
                <StatusDot active={!!row?.comp_2a_enabled} label="2A" />
                <StatusDot active={!!row?.comp_2b_enabled} label="2B" />
                <StatusDot active={!!row?.comp_2c_enabled} label="2C" />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <SmallMetric
                title="CHILLER OUT 1"
                value={fmtNumber(row?.evap_out_c1_f, 1)}
                unit="°F"
                subtitle="evaporator out 1"
                accent="cyan"
              />

              <SmallMetric
                title="CHILLER OUT 2"
                value={fmtNumber(row?.evap_out_c2_f, 1)}
                unit="°F"
                subtitle="evaporator out 2"
                accent="cyan"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MonitoringNJPage() {
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAssetCode, setSelectedAssetCode] = useState('CH-NJ-01')
  const [ch2Dashboard, setCh2Dashboard] = useState(null)

  const { isMobile, isTablet, isDesktop } = useViewport()

  async function fetchData({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true)
      }

      const [{ data, error: fetchError }, { data: ch2Data, error: ch2Error }] = await Promise.all([
        supabase
          .from('v_asset_points_latest')
          .select('*')
          .order('asset_code', { ascending: true })
          .order('display_order', { ascending: true }),
        supabase.from('v_ch2_dashboard').select('*').single(),
      ])

      if (fetchError) throw fetchError
      if (ch2Error && ch2Error.code !== 'PGRST116') throw ch2Error

      const normalized = Array.isArray(data) ? data.map(normalizeRow) : []

      setRows(normalized)
      setCh2Dashboard(ch2Data || null)

      if (!normalized.length && !ch2Data) {
        setError('No live telemetry rows returned from the live sources.')
      } else {
        setError('')
      }
    } catch (err) {
      setRows([])
      setCh2Dashboard(null)
      setError(err?.message || 'Failed to load live telemetry.')
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
      .channel('monitoring-telemetry-latest')
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ch2_latest',
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

  const njAssets = useMemo(() => {
    return assets.filter((asset) => {
      const code = String(asset.asset_code || '').toUpperCase()
      return code.includes('-NJ-')
    })
  }, [assets])

  const oldChillers = useMemo(() => {
    return njAssets.filter((asset) => {
      const code = String(asset.asset_code || '').toUpperCase()
      return String(asset.asset_type || '').toLowerCase() === 'chiller' && code !== 'CH-NJ-02'
    })
  }, [njAssets])

  const barrels = useMemo(() => {
    return njAssets
      .filter((asset) => String(asset.asset_type || '').toLowerCase() === 'barrel')
      .sort(barrelSort)
  }, [njAssets])

  const selectedAsset = useMemo(() => {
    if (!oldChillers.length) return null
    return oldChillers.find((asset) => asset.asset_code === selectedAssetCode) || oldChillers[0]
  }, [oldChillers, selectedAssetCode])

  useEffect(() => {
    if (!selectedAsset && oldChillers[0]) {
      setSelectedAssetCode(oldChillers[0].asset_code)
    }
  }, [selectedAsset, oldChillers])

  const summary = useMemo(() => {
    const ch2Online = ch2Dashboard?.is_online ? 1 : 0

    const oldWithoutCh2Count = njAssets.filter(
      (asset) => String(asset.asset_code || '').toUpperCase() !== 'CH-NJ-02'
    ).length

    const total =
      oldWithoutCh2Count +
      (ch2Dashboard
        ? 1
        : njAssets.some((asset) => String(asset.asset_code || '').toUpperCase() === 'CH-NJ-02')
          ? 1
          : 0) +
      barrels.length

    const online =
      njAssets.filter((asset) => {
        const code = String(asset.asset_code || '').toUpperCase()
        return code !== 'CH-NJ-02' && getAssetStatus(asset).online
      }).length + ch2Online

    const offline = Math.max(total - online, 0)

    const compressorsOnOld = njAssets
      .flatMap((asset) => asset.points)
      .filter((point) => {
        const group = String(point.point_group || '').toUpperCase()
        const code = String(point.point_code || '').toUpperCase()

        const isCompressorPoint =
          group.includes('COMPRESSOR') ||
          group.includes('COMPRESSORS') ||
          code.includes('COMP')

        return isCompressorPoint && point.value_boolean === true
      }).length

    const compressorsOnCh2 =
      (ch2Dashboard?.comp_1a_enabled ? 1 : 0) +
      (ch2Dashboard?.comp_1b_enabled ? 1 : 0) +
      (ch2Dashboard?.comp_1c_enabled ? 1 : 0) +
      (ch2Dashboard?.comp_2a_enabled ? 1 : 0) +
      (ch2Dashboard?.comp_2b_enabled ? 1 : 0) +
      (ch2Dashboard?.comp_2c_enabled ? 1 : 0)

    const barrelLevelPoint = barrels
      .flatMap((asset) => asset.points)
      .find((point) => {
        const code = String(point.point_code || '').toUpperCase()
        return code === 'LEVEL_PERCENT' || code.includes('RADAR') || code.includes('LEVEL')
      })

    return {
      total,
      online,
      offline,
      compressorsOn: compressorsOnOld + compressorsOnCh2,
      barrelLevel:
        barrelLevelPoint?.value_number === null || barrelLevelPoint?.value_number === undefined
          ? null
          : Number(barrelLevelPoint.value_number),
    }
  }, [njAssets, barrels, ch2Dashboard])

  const pagePadding = isMobile ? 12 : 16
  const mainGridColumns = isDesktop ? '1.3fr 0.9fr' : '1fr'
  const summaryColumns = isMobile
    ? 'repeat(2, minmax(0, 1fr))'
    : isTablet
      ? 'repeat(3, minmax(0, 1fr))'
      : 'repeat(5, minmax(120px, 1fr))'

  function handleChillerSelect(asset) {
    const code = String(asset?.asset_code || '').toUpperCase()

    if (code === 'CH-NJ-02') {
      navigate('/monitoring/nj/chiller-2')
      return
    }

    setSelectedAssetCode(asset.asset_code)
  }

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
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <button
              onClick={() => {
                window.location.href = '/'
              }}
              style={{
                ...pageButtonStyle(true, isMobile),
                marginBottom: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ArrowLeft size={16} />
              Back to locations
            </button>

            <div
              style={{
                color: '#67e8f9',
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 1.2,
              }}
            >
              FARMPLAST / NEW JERSEY
            </div>

            <h1
              style={{
                margin: '8px 0 8px',
                fontSize: isMobile ? 28 : 'clamp(30px, 4vw, 52px)',
                lineHeight: 1.02,
              }}
            >
              Plant HMI Dashboard
            </h1>

            <div style={{ color: '#cbd5e1', fontSize: isMobile ? 14 : 15 }}>
              Three chillers and material barrels with animated industrial visualization
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: summaryColumns,
              gap: 10,
              width: isDesktop ? 'min(100%, 820px)' : '100%',
              minWidth: 0,
            }}
          >
            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>TOTAL</div>
              <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 30, fontWeight: 900 }}>
                {summary.total}
              </div>
            </div>

            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ONLINE</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#4ade80',
                }}
              >
                {summary.online}
              </div>
            </div>

            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>OFFLINE</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#f87171',
                }}
              >
                {summary.offline}
              </div>
            </div>

            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>COMP ON</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#38bdf8',
                }}
              >
                {summary.compressorsOn}
              </div>
            </div>

            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>BARREL</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#facc15',
                }}
              >
                {summary.barrelLevel === null || Number.isNaN(summary.barrelLevel)
                  ? '—'
                  : `${summary.barrelLevel.toFixed(0)}%`}
              </div>
            </div>
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
          <div style={statCardStyle(isMobile)}>Loading live dashboard…</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mainGridColumns,
              gap: 18,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 18 }}>
              {oldChillers.length
                ? oldChillers.map((asset) => (
                    <div
                      key={asset.asset_code}
                      onClick={() => handleChillerSelect(asset)}
                      style={{ cursor: 'pointer' }}
                    >
                      <ChillerIllustration
                        asset={asset}
                        selected={selectedAsset?.asset_code === asset.asset_code}
                        onSelect={() => {}}
                        isMobile={isMobile}
                      />
                    </div>
                  ))
                : null}

              {ch2Dashboard ? (
                <Chiller2DashboardCard
                  row={ch2Dashboard}
                  isMobile={isMobile}
                  onClick={() => navigate('/monitoring/nj/chiller-2')}
                />
              ) : (
                <div style={statCardStyle(isMobile)}>No live Chiller 2 telemetry yet.</div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              {barrels[0] ? (
                <BarrelIllustration asset={barrels[0]} isMobile={isMobile} />
              ) : (
                <div style={statCardStyle(isMobile)}>No barrel 1 telemetry yet.</div>
              )}

              {barrels[1] ? (
                <BarrelIllustration asset={barrels[1]} isMobile={isMobile} />
              ) : (
                <div style={statCardStyle(isMobile)}>
                  <div
                    style={{
                      color: '#67e8f9',
                      fontSize: 13,
                      fontWeight: 900,
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    BARREL-NJ-02
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
                    Material Barrel 2
                  </div>

                  <div style={{ color: '#94a3b8', fontSize: 14 }}>
                    Second barrel is not in telemetry yet.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
