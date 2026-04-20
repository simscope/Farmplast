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
  RotateCcw,
  Save,
  Zap,
  Lock,
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

  if (['ON', 'RUN', 'TRUE', 'ACTIVE', 'ENABLE', 'ENABLED', 'OPEN', 'AUTO'].includes(text)) {
    return true
  }

  if (['OFF', 'STOP', 'FALSE', 'INACTIVE', 'DISABLE', 'DISABLED', 'CLOSED', 'MANUAL'].includes(text)) {
    return false
  }

  return false
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
          wordBreak: 'break-word',
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

function CommandButton({
  label,
  icon,
  active = false,
  danger = false,
  onClick,
  disabled = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 18,
        border: danger
          ? '1px solid rgba(248,113,113,0.30)'
          : active
            ? '1px solid rgba(34,211,238,0.30)'
            : '1px solid rgba(148,163,184,0.16)',
        background: danger
          ? 'rgba(127,29,29,0.28)'
          : active
            ? 'rgba(8,47,73,0.28)'
            : 'rgba(255,255,255,0.04)',
        color: disabled ? '#64748b' : '#f8fafc',
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

function FanSetpointCard({
  inputValue,
  setInputValue,
  liveValue,
  onSave,
  saving,
  condOut,
}) {
  const liveNum = Number(liveValue)
  const condNum = Number(condOut)
  const thresholdReached =
    !Number.isNaN(liveNum) && !Number.isNaN(condNum) ? condNum >= liveNum : false

  return (
    <div
      style={{
        width: '100%',
        borderRadius: 28,
        border: '1px solid rgba(250,204,21,0.26)',
        background:
          'linear-gradient(180deg, rgba(54,36,8,0.54) 0%, rgba(28,20,8,0.72) 100%)',
        padding: '22px 18px',
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
        Fan start setpoint
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 42,
          lineHeight: 1,
          fontWeight: 900,
          color: '#fde68a',
        }}
      >
        {liveValue === null || liveValue === undefined || Number.isNaN(Number(liveValue))
          ? '—'
          : `${Number(liveValue).toFixed(1)}°F`}
      </div>

      <div style={{ marginTop: 10, color: '#cbd5e1', fontSize: 13 }}>
        fan auto start by condenser out
      </div>

      <div style={{ marginTop: 16 }}>
        <label
          htmlFor="fan-setpoint-input"
          style={{
            display: 'block',
            marginBottom: 8,
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          New setpoint, °F
        </label>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 10,
          }}
        >
          <input
            id="fan-setpoint-input"
            type="number"
            step="0.1"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 16,
              border: '1px solid rgba(250,204,21,0.24)',
              background: 'rgba(15,23,42,0.72)',
              color: '#f8fafc',
              padding: '0 14px',
              fontSize: 16,
              fontWeight: 700,
              outline: 'none',
            }}
          />

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{
              height: 48,
              padding: '0 16px',
              borderRadius: 16,
              border: '1px solid rgba(250,204,21,0.28)',
              background: 'rgba(113,63,18,0.30)',
              color: saving ? '#94a3b8' : '#fde68a',
              fontSize: 14,
              fontWeight: 900,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Badge tone={thresholdReached ? 'yellow' : 'slate'}>
          {thresholdReached ? 'threshold reached' : 'below threshold'}
        </Badge>

        <Badge tone="red">
          cond out {condOut === null || Number.isNaN(Number(condOut)) ? '—' : `${Number(condOut).toFixed(1)}°F`}
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
        width: '100%',
        maxWidth: 390,
        margin: '0 auto',
        borderRadius: 24,
        border: alarm
          ? '1px solid rgba(248,113,113,0.22)'
          : '1px solid rgba(56,189,248,0.12)',
        background:
          'radial-gradient(circle at center, rgba(59,130,246,0.08) 0%, rgba(15,23,42,0.36) 58%, rgba(2,6,23,0.72) 100%)',
        minHeight: isMobile ? 250 : 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
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
          d="M 80 120 H 210"
          stroke={lineBlue}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowBlue)"
        />
        <path
          d="M 550 120 H 680"
          stroke={lineBlue}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowBlue)"
        />

        <path
          d="M 80 285 H 210"
          stroke={lineRed}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowRed)"
        />
        <path
          d="M 550 285 H 680"
          stroke={lineRed}
          strokeWidth="12"
          strokeLinecap="round"
          fill="none"
          filter="url(#glowRed)"
        />

        <polygon points="190,120 172,111 172,129" fill="#7dd3fc" />
        <polygon points="570,120 588,111 588,129" fill="#7dd3fc" />
        <polygon points="190,285 172,276 172,294" fill="#fda4af" />
        <polygon points="570,285 588,276 588,294" fill="#fda4af" />

        <rect
          x="210"
          y="78"
          width="340"
          height="235"
          rx="36"
          ry="36"
          fill="url(#shell)"
          stroke={alarm ? 'rgba(248,113,113,0.30)' : 'rgba(148,163,184,0.24)'}
          strokeWidth="2"
        />

        <rect
          x="300"
          y="102"
          width="160"
          height="165"
          rx="22"
          ry="22"
          fill="#0b1222"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth="1.5"
        />

        {[0, 1, 2, 3, 4, 5].map((i) => {
          const x = 325 + i * 22
          return (
            <line
              key={i}
              x1={x}
              y1="118"
              x2={x + 42}
              y2="250"
              stroke={i % 2 === 0 ? '#67e8f9' : '#fda4af'}
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.9"
            />
          )
        })}

        <text x="380" y="162" fill="#e2e8f0" fontSize="26" fontWeight="900" textAnchor="middle">
          PLATE HEAT
        </text>
        <text x="380" y="190" fill="#e2e8f0" fontSize="26" fontWeight="900" textAnchor="middle">
          EXCHANGER
        </text>

        <text x="380" y="220" fill="#64748b" fontSize="14" fontWeight="800" textAnchor="middle">
          inlet left / outlet right
        </text>

        <text x="380" y="246" fill="#64748b" fontSize="14" fontWeight="800" textAnchor="middle">
          chilled + condenser circuits
        </text>

        <circle cx="210" cy="120" r="8" fill="#7dd3fc" />
        <circle cx="550" cy="120" r="8" fill="#7dd3fc" />
        <circle cx="210" cy="285" r="8" fill="#fda4af" />
        <circle cx="550" cy="285" r="8" fill="#fda4af" />

        <text x="380" y="343" fill="#94a3b8" fontSize="18" fontWeight="900" textAnchor="middle">
          COMPRESSORS
        </text>

        <rect
          x="255"
          y="372"
          width="72"
          height="44"
          rx="22"
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(148,163,184,0.14)"
        />
        <circle
          cx="286"
          cy="394"
          r="8"
          fill={compressorA ? '#22c55e' : '#64748b'}
          filter={compressorA ? 'url(#glowBlue)' : undefined}
        />
        <text x="307" y="401" fill="#e2e8f0" fontSize="20" fontWeight="900" textAnchor="middle">
          A
        </text>

        <rect
          x="433"
          y="372"
          width="72"
          height="44"
          rx="22"
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(148,163,184,0.14)"
        />
        <circle
          cx="464"
          cy="394"
          r="8"
          fill={compressorB ? '#22c55e' : '#64748b'}
          filter={compressorB ? 'url(#glowBlue)' : undefined}
        />
        <text x="485" y="401" fill="#e2e8f0" fontSize="20" fontWeight="900" textAnchor="middle">
          B
        </text>
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

  const [fanSetpointInput, setFanSetpointInput] = useState('')
  const [sendingSetpoint, setSendingSetpoint] = useState(false)
  const [sendingSpeed, setSendingSpeed] = useState('')
  const [resettingAlert, setResettingAlert] = useState(false)
  const [commandMessage, setCommandMessage] = useState('')

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetPinInput, setResetPinInput] = useState('')
  const [resetPinError, setResetPinError] = useState('')

  const RESET_ALERT_PIN = '7720'

  async function sendCommand(commandType, commandValue) {
    setCommandMessage('')

    const payload = {
      asset_code: 'CH-NJ-01',
      command_type: commandType,
      command_value: String(commandValue),
      status: 'pending',
    }

    const { error: insertError } = await supabase.from('device_commands').insert(payload)

    if (insertError) {
      throw insertError
    }
  }

  function openResetAlertModal() {
    setResetPinInput('')
    setResetPinError('')
    setShowResetModal(true)
  }

  function closeResetAlertModal() {
    setShowResetModal(false)
    setResetPinInput('')
    setResetPinError('')
  }

  async function confirmResetAlertWithPin() {
    if (resetPinInput !== RESET_ALERT_PIN) {
      setResetPinError('Invalid PIN code')
      return
    }

    setResetPinError('')
    setShowResetModal(false)
    await handleResetAlert()
  }

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

    const telemetryChannel = supabase
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
      supabase.removeChannel(telemetryChannel)
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

  const fanSpeed = getTemperature(points, [
    'FAN SPEED',
    'FAN HZ',
    'FAN FREQUENCY',
    'COND FAN SPEED',
    'CONDENSER FAN SPEED',
    'CH1_FAN_SPEED',
    'CH1_FAN_HZ',
    'CH1_FAN_FREQUENCY',
  ])

  const deltaChw =
    chwIn !== null && chwOut !== null ? Number(chwIn) - Number(chwOut) : null

  const deltaCond =
    condOut !== null && condIn !== null ? Number(condOut) - Number(condIn) : null

  useEffect(() => {
    if (fanSetpoint !== null && fanSetpoint !== undefined && !Number.isNaN(Number(fanSetpoint))) {
      setFanSetpointInput(Number(fanSetpoint).toFixed(1))
    }
  }, [fanSetpoint])

  async function handleSaveSetpoint() {
    const value = Number(fanSetpointInput)

    if (Number.isNaN(value)) {
      setCommandMessage('Setpoint must be a valid number.')
      return
    }

    setSendingSetpoint(true)

    try {
      await sendCommand('fan_setpoint', value.toFixed(1))
      setCommandMessage(`Command queued: fan_setpoint = ${value.toFixed(1)} °F`)
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan setpoint command.')
    } finally {
      setSendingSetpoint(false)
    }
  }

  async function handleSetFanSpeed(speed) {
    setSendingSpeed(String(speed))

    try {
      await sendCommand('fan_speed', speed)
      setCommandMessage(`Command queued: fan_speed = ${speed} Hz`)
    } catch (err) {
      setCommandMessage(err?.message || `Failed to send fan speed ${speed} Hz.`)
    } finally {
      setSendingSpeed('')
    }
  }

  async function handleResetAlert() {
    setResettingAlert(true)

    try {
      await sendCommand('reset_alert', 1)
      setCommandMessage('Command queued: reset_alert')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send reset_alert command.')
    } finally {
      setResettingAlert(false)
    }
  }

  async function handleFanOn() {
    try {
      await sendCommand('fan_on', 1)
      setCommandMessage('Command queued: fan_on')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_on command.')
    }
  }

  async function handleFanOff() {
    try {
      await sendCommand('fan_off', 1)
      setCommandMessage('Command queued: fan_off')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_off command.')
    }
  }

  async function handleFanAuto() {
    try {
      await sendCommand('fan_mode', 'auto')
      setCommandMessage('Command queued: fan_mode = auto')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_mode auto.')
    }
  }

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

        {commandMessage ? (
          <div
            style={{
              ...statCardStyle(isMobile),
              marginBottom: 18,
              color: '#cbd5e1',
            }}
          >
            {commandMessage}
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
                    gridTemplateColumns: isMobile ? '1fr' : '220px minmax(320px, 390px) 220px',
                    gap: 16,
                    alignItems: 'stretch',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ display: 'grid', gap: 14 }}>
                    <SmallMetric
                      title="CHW IN"
                      value={fmtTemp(chwIn)}
                      subtitle="entering chilled water"
                      accent="cyan"
                    />
                    <SmallMetric
                      title="COND IN"
                      value={fmtTemp(condIn)}
                      subtitle="entering condenser water"
                      accent="red"
                    />
                  </div>

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

                  <div style={{ display: 'grid', gap: 14 }}>
                    <SmallMetric
                      title="CHW OUT"
                      value={fmtTemp(chwOut)}
                      subtitle="leaving chilled water"
                      accent="cyan"
                    />
                    <SmallMetric
                      title="COND OUT"
                      value={fmtTemp(condOut)}
                      subtitle="leaving condenser water"
                      accent="red"
                    />
                  </div>
                </div>
              </Panel>

              <Panel title="Fan setpoint and status" icon={<Fan size={18} />}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 420px) 1fr',
                    gap: 18,
                    alignItems: 'start',
                  }}
                >
                  <FanSetpointCard
                    inputValue={fanSetpointInput}
                    setInputValue={setFanSetpointInput}
                    liveValue={fanSetpoint}
                    onSave={handleSaveSetpoint}
                    saving={sendingSetpoint}
                    condOut={condOut}
                  />

                  <div style={{ display: 'grid', gap: 16 }}>
                    <Pill label="Fan status" active={fanRunning} onText="RUN" offText="STOP" />
                    <Pill label="Fan auto mode" active={fanAutoMode} onText="AUTO" offText="MANUAL" />
                    <Pill label="Compressor A" active={compressorA} onText="RUN" offText="STOP" />
                    <Pill label="Compressor B" active={compressorB} onText="RUN" offText="STOP" />
                  </div>
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
                    value={
                      fanSetpoint === null || fanSetpoint === undefined || Number.isNaN(Number(fanSetpoint))
                        ? '—'
                        : `${Number(fanSetpoint).toFixed(1)}°F`
                    }
                    subtitle="current live threshold"
                    accent="yellow"
                  />
                  <SmallMetric
                    title="FAN FREQUENCY"
                    value={
                      fanSpeed === null || fanSpeed === undefined || Number.isNaN(Number(fanSpeed))
                        ? '—'
                        : `${Number(fanSpeed).toFixed(0)} Hz`
                    }
                    subtitle="current live fan speed"
                    accent="cyan"
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <CommandButton
                      label={sendingSpeed === '30' ? 'Sending…' : '30 Hz'}
                      icon={<Zap size={16} />}
                      active={Number(fanSpeed) === 30}
                      onClick={() => handleSetFanSpeed(30)}
                      disabled={sendingSpeed !== ''}
                    />
                    <CommandButton
                      label={sendingSpeed === '60' ? 'Sending…' : '60 Hz'}
                      icon={<Zap size={16} />}
                      active={Number(fanSpeed) === 60}
                      onClick={() => handleSetFanSpeed(60)}
                      disabled={sendingSpeed !== ''}
                    />
                  </div>
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

              <Panel title="Alarm and commands" icon={<Settings size={18} />} danger={alarm}>
                <div style={{ display: 'grid', gap: 14 }}>
                  <SmallMetric
                    title="ALARM STATUS"
                    value={alarm ? 'ACTIVE' : 'NORMAL'}
                    subtitle="current live alarm state"
                    accent={alarm ? 'red' : 'green'}
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <CommandButton
                      label="Fan ON"
                      icon={<Power size={16} />}
                      onClick={handleFanOn}
                    />
                    <CommandButton
                      label="Fan OFF"
                      icon={<Power size={16} />}
                      onClick={handleFanOff}
                    />
                    <CommandButton
                      label={resettingAlert ? 'Resetting…' : 'RESET ALERT'}
                      icon={<RotateCcw size={16} />}
                      danger
                      onClick={openResetAlertModal}
                      disabled={resettingAlert}
                    />
                    <CommandButton
                      label="AUTO FAN"
                      icon={<Fan size={16} />}
                      active={fanAutoMode}
                      onClick={handleFanAuto}
                    />
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {showResetModal ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(2,6,23,0.78)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 2000,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 28,
                border: '1px solid rgba(248,113,113,0.28)',
                background:
                  'linear-gradient(180deg, rgba(28,10,16,0.96) 0%, rgba(10,10,18,0.98) 100%)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: 22 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <Lock size={18} />
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    Reset alert authorization
                  </div>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 14 }}>
                  Enter PIN code to send <strong>RESET ALERT</strong> command.
                </div>

                <label
                  htmlFor="reset-alert-pin"
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    color: '#e2e8f0',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  PIN code
                </label>

                <input
                  id="reset-alert-pin"
                  type="password"
                  inputMode="numeric"
                  value={resetPinInput}
                  onChange={(e) => {
                    setResetPinInput(e.target.value)
                    if (resetPinError) setResetPinError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      confirmResetAlertWithPin()
                    }
                    if (e.key === 'Escape') {
                      closeResetAlertModal()
                    }
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    height: 50,
                    borderRadius: 16,
                    border: '1px solid rgba(248,113,113,0.24)',
                    background: 'rgba(15,23,42,0.72)',
                    color: '#f8fafc',
                    padding: '0 14px',
                    fontSize: 16,
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />

                {resetPinError ? (
                  <div
                    style={{
                      marginTop: 10,
                      color: '#fca5a5',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {resetPinError}
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 18,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={closeResetAlertModal}
                    style={{
                      height: 48,
                      borderRadius: 16,
                      border: '1px solid rgba(148,163,184,0.18)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#e2e8f0',
                      fontSize: 14,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={confirmResetAlertWithPin}
                    style={{
                      height: 48,
                      borderRadius: 16,
                      border: '1px solid rgba(248,113,113,0.28)',
                      background: 'rgba(127,29,29,0.28)',
                      color: '#fecaca',
                      fontSize: 14,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Confirm reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
