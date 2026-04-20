import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Fan,
  Thermometer,
  Gauge,
  Activity,
  Settings,
  Power,
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

  if (['ON', 'RUN', 'TRUE', 'ACTIVE', 'ENABLE', 'ENABLED', 'OPEN'].includes(text)) return true
  if (['OFF', 'STOP', 'FALSE', 'INACTIVE', 'DISABLE', 'DISABLED', 'CLOSED'].includes(text)) return false

  return false
}

function fmtNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function fmtTemp(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(digits)}°F`
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: {
      border: '1px solid rgba(148,163,184,0.20)',
      bg: 'rgba(255,255,255,0.05)',
      color: '#e2e8f0',
    },
    green: {
      border: '1px solid rgba(74,222,128,0.28)',
      bg: 'rgba(20,83,45,0.24)',
      color: '#86efac',
    },
    red: {
      border: '1px solid rgba(248,113,113,0.30)',
      bg: 'rgba(127,29,29,0.24)',
      color: '#fca5a5',
    },
    cyan: {
      border: '1px solid rgba(34,211,238,0.28)',
      bg: 'rgba(8,47,73,0.24)',
      color: '#67e8f9',
    },
    yellow: {
      border: '1px solid rgba(250,204,21,0.28)',
      bg: 'rgba(113,63,18,0.24)',
      color: '#fde68a',
    },
  }

  const t = tones[tone] || tones.slate

  return (
    <div
      style={{
        borderRadius: 999,
        padding: '8px 14px',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
        border: t.border,
        background: t.bg,
        color: t.color,
      }}
    >
      {children}
    </div>
  )
}

function Panel({ title, icon, children, danger = false }) {
  return (
    <div
      style={{
        borderRadius: 28,
        border: danger
          ? '1px solid rgba(248,113,113,0.28)'
          : '1px solid rgba(56,189,248,0.20)',
        background:
          danger
            ? 'linear-gradient(180deg, rgba(48,12,20,0.95) 0%, rgba(18,8,14,0.98) 100%)'
            : 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
        boxShadow: '0 0 0 1px rgba(96,165,250,0.05) inset, 0 20px 50px rgba(0,0,0,0.24)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {icon}
          <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

function SmallMetric({ title, value, subtitle = '', accent = 'cyan' }) {
  const tones = {
    cyan: {
      border: 'rgba(34,211,238,0.24)',
      bg: 'rgba(8,47,73,0.20)',
      title: '#67e8f9',
      value: '#e0f2fe',
    },
    red: {
      border: 'rgba(248,113,113,0.24)',
      bg: 'rgba(127,29,29,0.20)',
      title: '#fca5a5',
      value: '#fee2e2',
    },
    green: {
      border: 'rgba(74,222,128,0.24)',
      bg: 'rgba(20,83,45,0.20)',
      title: '#86efac',
      value: '#dcfce7',
    },
    yellow: {
      border: 'rgba(250,204,21,0.24)',
      bg: 'rgba(113,63,18,0.20)',
      title: '#fde68a',
      value: '#fef3c7',
    },
    slate: {
      border: 'rgba(148,163,184,0.20)',
      bg: 'rgba(255,255,255,0.04)',
      title: '#cbd5e1',
      value: '#f8fafc',
    },
  }

  const t = tones[accent] || tones.cyan

  return (
    <div
      style={{
        borderRadius: 22,
        border: `1px solid ${t.border}`,
        background: t.bg,
        padding: '16px 18px',
        minHeight: 104,
      }}
    >
      <div style={{ color: t.title, fontSize: 12, fontWeight: 900, letterSpacing: 0.9 }}>
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          color: t.value,
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 900,
        }}
      >
        {value}
      </div>

      {subtitle ? (
        <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

function Pill({ label, active, onText = 'ON', offText = 'OFF' }) {
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
        gap: 12,
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
          fontWeight: 900,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: active ? '#22c55e' : '#64748b',
            boxShadow: active ? '0 0 12px rgba(34,197,94,0.65)' : 'none',
          }}
        />
        {active ? onText : offText}
      </div>
    </div>
  )
}

function HMICtrlButton({ label, icon, active = false, disabled = true }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        borderRadius: 18,
        border: active
          ? '1px solid rgba(34,211,238,0.28)'
          : '1px solid rgba(148,163,184,0.16)',
        background: active ? 'rgba(8,47,73,0.28)' : 'rgba(255,255,255,0.04)',
        color: disabled ? '#94a3b8' : '#f8fafc',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
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

function FanSetpointCard({ value, condOut, fanRunning }) {
  const thresholdReached =
    value !== null && condOut !== null ? Number(condOut) >= Number(value) : false

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        borderRadius: 28,
        border: '1px solid rgba(250,204,21,0.26)',
        background:
          'linear-gradient(180deg, rgba(54,36,8,0.54) 0%, rgba(28,20,8,0.72) 100%)',
        padding: '22px 18px',
        textAlign: 'center',
        boxShadow: '0 0 0 1px rgba(250,204,21,0.05) inset',
      }}
    >
      <div
        style={{
          color: '#facc15',
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        Fan auto start setpoint
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 46,
          lineHeight: 1,
          fontWeight: 900,
          color: '#fde68a',
        }}
      >
        {value === null ? '—' : Number(value).toFixed(1)}
        {value === null ? null : <span style={{ marginLeft: 4 }}>°F</span>}
      </div>

      <div style={{ marginTop: 12, color: '#cbd5e1', fontSize: 13 }}>
        fan control threshold by condenser out
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Badge tone={thresholdReached ? 'yellow' : 'slate'}>
          {thresholdReached ? 'threshold reached' : 'below threshold'}
        </Badge>

        <Badge tone={fanRunning ? 'green' : 'slate'}>
          {fanRunning ? 'fan running' : 'fan stopped'}
        </Badge>
      </div>
    </div>
  )
}

function ProcessMimic({
  isMobile,
  chwIn,
  chwOut,
  condIn,
  condOut,
  compressorA,
  compressorB,
  fanRunning,
  alarm,
}) {
  const lineBlue = '#38bdf8'
  const lineRed = '#fb7185'
  const fanColor = fanRunning ? '#22c55e' : '#64748b'

  return (
    <div
      style={{
        borderRadius: 28,
        border: alarm
          ? '1px solid rgba(248,113,113,0.24)'
          : '1px solid rgba(56,189,248,0.14)',
        background:
          'radial-gradient(circle at center, rgba(59,130,246,0.10) 0%, rgba(15,23,42,0.42) 55%, rgba(2,6,23,0.76) 100%)',
        minHeight: isMobile ? 320 : 390,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
      }}
    >
      <svg
        viewBox="0 0 760 420"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <filter id="glowBlue">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glowRed">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2742" />
            <stop offset="100%" stopColor="#10182d" />
          </linearGradient>

          <linearGradient id="compressor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#263a5f" />
            <stop offset="100%" stopColor="#11192e" />
          </linearGradient>
        </defs>

        <path
          d="M 40 110 H 210"
          stroke={lineBlue}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowBlue)"
        />
        <path
          d="M 550 110 H 720"
          stroke={lineBlue}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowBlue)"
        />

        <path
          d="M 40 300 H 210"
          stroke={lineRed}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowRed)"
        />
        <path
          d="M 550 300 H 720"
          stroke={lineRed}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowRed)"
        />

        <polygon points="190,110 172,101 172,119" fill="#7dd3fc" />
        <polygon points="570,110 588,101 588,119" fill="#7dd3fc" />
        <polygon points="190,300 172,291 172,309" fill="#fda4af" />
        <polygon points="570,300 588,291 588,309" fill="#fda4af" />

        <rect
          x="210"
          y="68"
          width="340"
          height="275"
          rx="36"
          ry="36"
          fill="url(#shell)"
          stroke={alarm ? 'rgba(248,113,113,0.30)' : 'rgba(148,163,184,0.24)'}
          strokeWidth="2"
        />

        <rect
          x="290"
          y="88"
          width="180"
          height="235"
          rx="24"
          ry="24"
          fill="#0b1222"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth="1.5"
        />

        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const x = 320 + i * 20
          return (
            <line
              key={i}
              x1={x}
              y1="102"
              x2={x + 50}
              y2="305"
              stroke={i % 2 === 0 ? '#67e8f9' : '#fda4af'}
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.9"
            />
          )
        })}

        <text x="380" y="158" fill="#e2e8f0" fontSize="22" fontWeight="900" textAnchor="middle">
          CHILLER 1
        </text>
        <text x="380" y="188" fill="#94a3b8" fontSize="16" fontWeight="800" textAnchor="middle">
          EVAP / CONDENSER LOOP
        </text>

        <rect
          x="225"
          y="92"
          width="48"
          height="96"
          rx="20"
          fill="url(#compressor)"
          stroke={compressorA ? 'rgba(74,222,128,0.40)' : 'rgba(148,163,184,0.18)'}
        />
        <text x="249" y="132" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
          A
        </text>
        <circle
          cx="249"
          cy="158"
          r="8"
          fill={compressorA ? '#22c55e' : '#64748b'}
          filter={compressorA ? 'url(#glowBlue)' : undefined}
        />

        <rect
          x="225"
          y="222"
          width="48"
          height="96"
          rx="20"
          fill="url(#compressor)"
          stroke={compressorB ? 'rgba(74,222,128,0.40)' : 'rgba(148,163,184,0.18)'}
        />
        <text x="249" y="262" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
          B
        </text>
        <circle
          cx="249"
          cy="288"
          r="8"
          fill={compressorB ? '#22c55e' : '#64748b'}
          filter={compressorB ? 'url(#glowBlue)' : undefined}
        />

        <circle
          cx="510"
          cy="205"
          r="38"
          fill="#0f172a"
          stroke={fanRunning ? 'rgba(74,222,128,0.40)' : 'rgba(148,163,184,0.20)'}
          strokeWidth="2"
        />
        <circle
          cx="510"
          cy="205"
          r="8"
          fill={fanColor}
        />
        <path
          d="M510 170 C535 178, 540 198, 520 205"
          fill={fanColor}
          opacity="0.9"
        />
        <path
          d="M545 205 C537 228, 516 236, 508 216"
          fill={fanColor}
          opacity="0.85"
        />
        <path
          d="M508 240 C482 232, 476 212, 496 205"
          fill={fanColor}
          opacity="0.8"
        />
        <text x="510" y="268" fill="#cbd5e1" fontSize="16" fontWeight="900" textAnchor="middle">
          FAN
        </text>

        <text x="70" y="88" fill="#7dd3fc" fontSize="18" fontWeight="900">CHW IN</text>
        <text x="615" y="88" fill="#7dd3fc" fontSize="18" fontWeight="900">CHW OUT</text>
        <text x="55" y="278" fill="#fda4af" fontSize="18" fontWeight="900">COND IN</text>
        <text x="605" y="278" fill="#fda4af" fontSize="18" fontWeight="900">COND OUT</text>

        <text x="60" y="135" fill="#e2e8f0" fontSize="28" fontWeight="900">{fmtTemp(chwIn)}</text>
        <text x="598" y="135" fill="#e2e8f0" fontSize="28" fontWeight="900">{fmtTemp(chwOut)}</text>
        <text x="60" y="325" fill="#fee2e2" fontSize="28" fontWeight="900">{fmtTemp(condIn)}</text>
        <text x="585" y="325" fill="#fee2e2" fontSize="28" fontWeight="900">{fmtTemp(condOut)}</text>
      </svg>
    </div>
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

  const fanRunning = getBoolean(points, [
    'FAN STATUS',
    'FAN RUN',
    'FAN ENABLED',
    'FAN ON',
    'COND FAN',
    'CONDENSER FAN',
    'CH1_FAN_STATUS',
    'CH1_COND_FAN_STATUS',
  ])

  const fanAutoMode = getBoolean(points, [
    'FAN AUTO',
    'AUTO FAN',
    'FAN AUTO MODE',
    'CH1_FAN_AUTO',
  ])

  const fanSetpoint = getTemperature(points, [
    'FAN SETPOINT',
    'FAN START SETPOINT',
    'CONDENSER FAN SETPOINT',
    'COND FAN SETPOINT',
    'FAN AUTO START',
    'CH1_FAN_SETPOINT',
    'CH1_COND_FAN_SETPOINT',
  ])

  const deltaChw =
    chwIn !== null && chwOut !== null ? Number(chwIn) - Number(chwOut) : null

  const deltaCond =
    condOut !== null && condIn !== null ? Number(condOut) - Number(condIn) : null

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
      <div style={{ maxWidth: 1680, margin: '0 auto' }}>
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
          <div style={{ minWidth: 0, flex: '1 1 360px' }}>
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
                fontSize: isMobile ? 30 : 'clamp(32px, 4vw, 56px)',
                lineHeight: 1.02,
              }}
            >
              Chiller 1
            </h1>

            <div style={{ color: '#cbd5e1', fontSize: isMobile ? 14 : 15 }}>
              condenser fan control, water temperatures, compressor status
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={online ? 'green' : 'red'}>
              {online ? 'online' : 'offline'}
            </Badge>
            <Badge tone={alarm ? 'red' : 'slate'}>
              {alarm ? 'alarm active' : 'normal'}
            </Badge>
            <Badge tone={fanRunning ? 'green' : 'slate'}>
              {fanRunning ? 'fan on' : 'fan off'}
            </Badge>
            <Badge tone="cyan">{asset?.asset_code || 'CH-NJ-01'}</Badge>
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
              gridTemplateColumns: isDesktop ? '1.45fr 0.9fr' : '1fr',
              gap: 18,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 18 }}>
              <Panel
                title="Process overview"
                icon={<Activity size={18} />}
                danger={alarm}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(320px, 0.8fr)',
                    gap: 18,
                    alignItems: 'stretch',
                  }}
                >
                  <ProcessMimic
                    isMobile={isMobile}
                    chwIn={chwIn}
                    chwOut={chwOut}
                    condIn={condIn}
                    condOut={condOut}
                    compressorA={compressorA}
                    compressorB={compressorB}
                    fanRunning={fanRunning}
                    alarm={alarm}
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateRows: 'auto auto',
                      gap: 16,
                      alignContent: 'start',
                      justifyItems: 'center',
                    }}
                  >
                    <FanSetpointCard
                      value={fanSetpoint}
                      condOut={condOut}
                      fanRunning={fanRunning}
                    />

                    <div
                      style={{
                        width: '100%',
                        display: 'grid',
                        gap: 12,
                      }}
                    >
                      <Pill label="Fan status" active={fanRunning} onText="RUN" offText="STOP" />
                      <Pill label="Fan auto mode" active={fanAutoMode} onText="AUTO" offText="MANUAL" />
                      <Pill label="Compressor A" active={compressorA} onText="RUN" offText="STOP" />
                      <Pill label="Compressor B" active={compressorB} onText="RUN" offText="STOP" />
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Temperatures" icon={<Thermometer size={18} />}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                    gap: 14,
                  }}
                >
                  <SmallMetric
                    title="CHW IN"
                    value={fmtTemp(chwIn)}
                    subtitle="entering chilled water"
                    accent="cyan"
                  />
                  <SmallMetric
                    title="CHW OUT"
                    value={fmtTemp(chwOut)}
                    subtitle="leaving chilled water"
                    accent="cyan"
                  />
                  <SmallMetric
                    title="COND IN"
                    value={fmtTemp(condIn)}
                    subtitle="entering condenser water"
                    accent="red"
                  />
                  <SmallMetric
                    title="COND OUT"
                    value={fmtTemp(condOut)}
                    subtitle="leaving condenser water"
                    accent="red"
                  />
                </div>
              </Panel>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <Panel title="Fan control" icon={<Fan size={18} />}>
                <div style={{ display: 'grid', gap: 14 }}>
                  <SmallMetric
                    title="COND OUT"
                    value={fmtTemp(condOut)}
                    subtitle="main control temperature"
                    accent="red"
                  />
                  <SmallMetric
                    title="FAN START SETPOINT"
                    value={fanSetpoint === null ? '—' : `${Number(fanSetpoint).toFixed(1)}°F`}
                    subtitle="auto fan start threshold"
                    accent="yellow"
                  />
                  <SmallMetric
                    title="DIFFERENCE"
                    value={
                      condOut !== null && fanSetpoint !== null
                        ? `${(Number(condOut) - Number(fanSetpoint)).toFixed(1)}°F`
                        : '—'
                    }
                    subtitle="cond out - fan setpoint"
                    accent="slate"
                  />
                </div>
              </Panel>

              <Panel title="Water and load" icon={<Gauge size={18} />}>
                <div style={{ display: 'grid', gap: 14 }}>
                  <SmallMetric
                    title="ΔT CHW"
                    value={deltaChw === null ? '—' : `${Number(deltaChw).toFixed(1)}°F`}
                    subtitle="CHW IN - CHW OUT"
                    accent="cyan"
                  />
                  <SmallMetric
                    title="ΔT COND"
                    value={deltaCond === null ? '—' : `${Number(deltaCond).toFixed(1)}°F`}
                    subtitle="COND OUT - COND IN"
                    accent="red"
                  />
                  <SmallMetric
                    title="SYSTEM"
                    value={online ? 'ONLINE' : 'OFFLINE'}
                    subtitle="live telemetry status"
                    accent={online ? 'green' : 'red'}
                  />
                </div>
              </Panel>

              <Panel title="Controls" icon={<Settings size={18} />}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <HMICtrlButton label="Start" icon={<Power size={16} />} />
                  <HMICtrlButton label="Stop" icon={<Power size={16} />} />
                  <HMICtrlButton label="Auto Fan" icon={<Fan size={16} />} active />
                  <HMICtrlButton label="Manual Fan" icon={<Fan size={16} />} />
                </div>

                <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 13 }}>
                  buttons are visual only for now. current page is read-only telemetry hmi.
                </div>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
