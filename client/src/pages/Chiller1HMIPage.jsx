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
  Snowflake,
  Wind,
  Cpu,
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

function fmtHz(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toFixed(0)} Hz`
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

function Panel({ title, icon, children, danger = false, accent = 'cyan' }) {
  const borderColor =
    danger
      ? 'rgba(248,113,113,0.28)'
      : accent === 'yellow'
        ? 'rgba(250,204,21,0.24)'
        : accent === 'green'
          ? 'rgba(74,222,128,0.24)'
          : 'rgba(56,189,248,0.20)'

  return (
    <div
      style={{
        borderRadius: 28,
        border: `1px solid ${borderColor}`,
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

function SectionTitle({ icon, title, subtitle, tone = 'cyan' }) {
  const color =
    tone === 'yellow'
      ? '#fde68a'
      : tone === 'green'
        ? '#86efac'
        : tone === 'red'
          ? '#fca5a5'
          : '#67e8f9'

  return (
    <div
      style={{
        borderRadius: 26,
        border: '1px solid rgba(148,163,184,0.16)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.70) 0%, rgba(2,6,23,0.84) 100%)',
        padding: '18px 20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            color,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{title}</div>
          <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 14 }}>{subtitle}</div>
        </div>
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

function ChillerMimic({
  isMobile,
  chwIn,
  chwOut,
  condIn,
  condOut,
  compressorA,
  compressorB,
  alarm,
}) {
  const lineBlue = '#38bdf8'
  const lineRed = '#fb7185'

  return (
    <div
      style={{
        borderRadius: 28,
        border: alarm
          ? '1px solid rgba(248,113,113,0.24)'
          : '1px solid rgba(56,189,248,0.14)',
        background:
          'radial-gradient(circle at center, rgba(59,130,246,0.10) 0%, rgba(15,23,42,0.42) 55%, rgba(2,6,23,0.76) 100%)',
        minHeight: isMobile ? 300 : 360,
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
          <filter id="glowBlueCh">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glowRedCh">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="shellCh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2742" />
            <stop offset="100%" stopColor="#10182d" />
          </linearGradient>

          <linearGradient id="compressorCh" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#263a5f" />
            <stop offset="100%" stopColor="#11192e" />
          </linearGradient>
        </defs>

        <path d="M 40 110 H 210" stroke={lineBlue} strokeWidth="12" strokeLinecap="round" fill="none" filter="url(#glowBlueCh)" />
        <path d="M 550 110 H 720" stroke={lineBlue} strokeWidth="12" strokeLinecap="round" fill="none" filter="url(#glowBlueCh)" />
        <path d="M 40 300 H 210" stroke={lineRed} strokeWidth="12" strokeLinecap="round" fill="none" filter="url(#glowRedCh)" />
        <path d="M 550 300 H 720" stroke={lineRed} strokeWidth="12" strokeLinecap="round" fill="none" filter="url(#glowRedCh)" />

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
          fill="url(#shellCh)"
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
          CHILLER
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
          fill="url(#compressorCh)"
          stroke={compressorA ? 'rgba(74,222,128,0.40)' : 'rgba(148,163,184,0.18)'}
        />
        <text x="249" y="132" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">A</text>
        <circle cx="249" cy="158" r="8" fill={compressorA ? '#22c55e' : '#64748b'} />

        <rect
          x="225"
          y="222"
          width="48"
          height="96"
          rx="20"
          fill="url(#compressorCh)"
          stroke={compressorB ? 'rgba(74,222,128,0.40)' : 'rgba(148,163,184,0.18)'}
        />
        <text x="249" y="262" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">B</text>
        <circle cx="249" cy="288" r="8" fill={compressorB ? '#22c55e' : '#64748b'} />

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

function FanMimic({ fanRunning, fan30Active, fan60Active, fanAutoMode, alarm }) {
  const ringColor = alarm ? '#fb7185' : fanRunning ? '#22c55e' : '#64748b'
  const bladeColor = fanRunning ? '#cbd5e1' : '#94a3b8'
  const centerColor = fanRunning ? '#e2e8f0' : '#cbd5e1'
  const hzText = fan60Active ? '60 HZ' : fan30Active ? '30 HZ' : 'STOP'

  return (
    <div
      style={{
        borderRadius: 28,
        border: alarm
          ? '1px solid rgba(248,113,113,0.24)'
          : '1px solid rgba(74,222,128,0.16)',
        background:
          'radial-gradient(circle at center, rgba(34,197,94,0.10) 0%, rgba(15,23,42,0.42) 55%, rgba(2,6,23,0.76) 100%)',
        minHeight: 300,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <svg width="240" height="240" viewBox="0 0 240 240" style={{ display: 'block', margin: '0 auto' }}>
          <defs>
            <radialGradient id="fanBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(30,41,59,0.95)" />
              <stop offset="100%" stopColor="rgba(2,6,23,1)" />
            </radialGradient>

            <filter id="fanGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* outer ring */}
          <circle
            cx="120"
            cy="120"
            r="90"
            fill="none"
            stroke={ringColor}
            strokeWidth="10"
            opacity="0.95"
            filter={fanRunning ? 'url(#fanGlow)' : 'none'}
          />

          {/* inner housing */}
          <circle
            cx="120"
            cy="120"
            r="62"
            fill="url(#fanBg)"
            stroke="rgba(148,163,184,0.10)"
            strokeWidth="2"
          />

          {/* blade 1 */}
          <path
            d="M120 112
               C132 84, 156 78, 174 90
               C178 108, 160 121, 133 126
               C127 124, 123 120, 120 112Z"
            fill={bladeColor}
            opacity="0.95"
          />

          {/* blade 2 */}
          <path
            d="M112 124
               C84 136, 78 160, 90 178
               C108 182, 121 164, 126 137
               C124 131, 120 127, 112 124Z"
            fill={bladeColor}
            opacity="0.90"
          />

          {/* blade 3 */}
          <path
            d="M124 112
               C136 84, 130 58, 112 48
               C94 50, 90 72, 103 96
               C109 101, 115 104, 124 112Z"
            fill={bladeColor}
            opacity="0.85"
          />

          {/* center hub */}
          <circle
            cx="120"
            cy="120"
            r="16"
            fill={centerColor}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="2"
          />
        </svg>

        <div style={{ marginTop: 18, fontSize: 28, fontWeight: 900, color: '#f8fafc' }}>
          {hzText}
        </div>

        <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 14 }}>
          {fanAutoMode ? 'auto fan control' : 'manual fan control'}
        </div>
      </div>
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
  const [sendingMode, setSendingMode] = useState('')
  const [sendingPower, setSendingPower] = useState('')
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
    if (insertError) throw insertError

    setTimeout(() => {
      fetchData({ silent: true })
    }, 600)
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

  const chwIn = getTemperature(points, ['CH1_CHW_IN', 'CHW IN'])
  const chwOut = getTemperature(points, ['CH1_CHW_OUT', 'CHW OUT'])
  const condIn = getTemperature(points, ['CH1_CDW_IN', 'COND IN', 'CDW IN'])
  const condOut = getTemperature(points, ['CH1_CDW_OUT', 'COND OUT', 'CDW OUT'])

  const compressorA = getBoolean(points, ['CH1_COMP1', 'COMP1', 'COMP A'])
  const compressorB = getBoolean(points, ['CH1_COMP2', 'COMP2', 'COMP B'])

  const fanRunning = getBoolean(points, ['CH1_FAN_ENABLE', 'FAN ENABLE'])
  const fanAutoMode = getBoolean(points, ['CH1_AUTO', 'AUTO'])
  const fan30Active = getBoolean(points, ['CH1_FAN_30'])
  const fan60Active = getBoolean(points, ['CH1_FAN_60'])
  const fanSetpoint = getTemperature(points, ['CH1_SETPOINT', 'SETPOINT'])
  const fanSpeed = fan60Active ? 60 : fan30Active ? 30 : null

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

  async function handleFanOff() {
    setSendingPower('off')
    try {
      await sendCommand('fan_off', 1)
      setCommandMessage('Command queued: fan_off')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_off command.')
    } finally {
      setSendingPower('')
    }
  }

  async function handleFanAuto() {
    setSendingMode('auto')
    try {
      await sendCommand('fan_mode', 'auto')
      setCommandMessage('Command queued: fan_mode = auto')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_mode auto.')
    } finally {
      setSendingMode('')
    }
  }

  async function handleFanManual() {
    setSendingMode('manual')
    try {
      await sendCommand('fan_mode', 'manual')
      setCommandMessage('Command queued: fan_mode = manual')
    } catch (err) {
      setCommandMessage(err?.message || 'Failed to send fan_mode manual.')
    } finally {
      setSendingMode('')
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
              chiller section and condenser fan section separated
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
            <Badge tone={fanAutoMode ? 'yellow' : 'slate'}>
              {fanAutoMode ? 'auto' : 'manual'}
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
          <div style={{ display: 'grid', gap: 18 }}>
            <SectionTitle
              icon={<Snowflake size={22} />}
              title="Chiller section"
              subtitle="evaporator, condenser water, compressors"
              tone="cyan"
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? '1.2fr 0.8fr' : '1fr',
                gap: 18,
              }}
            >
              <Panel title="Chiller overview" icon={<Activity size={18} />} danger={alarm}>
                <ChillerMimic
                  isMobile={isMobile}
                  chwIn={chwIn}
                  chwOut={chwOut}
                  condIn={condIn}
                  condOut={condOut}
                  compressorA={compressorA}
                  compressorB={compressorB}
                  alarm={alarm}
                />
              </Panel>

              <Panel title="Chiller status" icon={<Cpu size={18} />}>
                <div style={{ display: 'grid', gap: 14 }}>
                  <Pill label="Compressor A" active={compressorA} onText="RUN" offText="STOP" />
                  <Pill label="Compressor B" active={compressorB} onText="RUN" offText="STOP" />
                  <Pill label="Alarm" active={alarm} onText="ACTIVE" offText="NORMAL" />
                  <Pill label="Chiller online" active={online} onText="ONLINE" offText="OFFLINE" />
                </div>
              </Panel>
            </div>

            <Panel title="Chiller temperatures and load" icon={<Thermometer size={18} />}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(6, minmax(0, 1fr))',
                  gap: 14,
                }}
              >
                <SmallMetric title="CHW IN" value={fmtTemp(chwIn)} subtitle="entering chilled water" accent="cyan" />
                <SmallMetric title="CHW OUT" value={fmtTemp(chwOut)} subtitle="leaving chilled water" accent="cyan" />
                <SmallMetric title="COND IN" value={fmtTemp(condIn)} subtitle="entering condenser water" accent="red" />
                <SmallMetric title="COND OUT" value={fmtTemp(condOut)} subtitle="leaving condenser water" accent="red" />
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
              </div>
            </Panel>

            <SectionTitle
              icon={<Wind size={22} />}
              title="Fan section"
              subtitle="manual OFF / 30 Hz / 60 Hz and auto threshold control"
              tone="yellow"
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop ? '0.95fr 1.05fr' : '1fr',
                gap: 18,
              }}
            >
              <Panel title="Fan live state" icon={<Fan size={18} />} accent="green">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '0.9fr 1.1fr',
                    gap: 18,
                    alignItems: 'stretch',
                  }}
                >
                  <FanMimic
                    fanRunning={fanRunning}
                    fan30Active={fan30Active}
                    fan60Active={fan60Active}
                    fanAutoMode={fanAutoMode}
                    alarm={alarm}
                  />

                  <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
                    <SmallMetric
                      title="FAN STATUS"
                      value={fanRunning ? 'RUN' : 'STOP'}
                      subtitle="actual enable state"
                      accent={fanRunning ? 'green' : 'slate'}
                    />
                    <SmallMetric
                      title="MODE"
                      value={fanAutoMode ? 'AUTO' : 'MANUAL'}
                      subtitle="current fan mode"
                      accent={fanAutoMode ? 'yellow' : 'slate'}
                    />
                    <SmallMetric
                      title="FREQUENCY"
                      value={fmtHz(fanSpeed)}
                      subtitle="actual selected speed"
                      accent="cyan"
                    />
                    <SmallMetric
                      title="COND OUT"
                      value={fmtTemp(condOut)}
                      subtitle="main control temperature"
                      accent="red"
                    />
                  </div>
                </div>
              </Panel>

              <Panel title="Fan control" icon={<Settings size={18} />} accent="yellow" danger={alarm}>
                <div style={{ display: 'grid', gap: 18 }}>
                  <FanSetpointCard
                    inputValue={fanSetpointInput}
                    setInputValue={setFanSetpointInput}
                    liveValue={fanSetpoint}
                    onSave={handleSaveSetpoint}
                    saving={sendingSetpoint}
                    condOut={condOut}
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <CommandButton
                      label={sendingMode === 'auto' ? 'Sending…' : 'AUTO'}
                      icon={<Fan size={16} />}
                      active={fanAutoMode}
                      onClick={handleFanAuto}
                      disabled={sendingMode !== ''}
                    />
                    <CommandButton
                      label={sendingMode === 'manual' ? 'Sending…' : 'MANUAL'}
                      icon={<Settings size={16} />}
                      active={!fanAutoMode}
                      onClick={handleFanManual}
                      disabled={sendingMode !== ''}
                    />
                    <CommandButton
                      label={sendingPower === 'off' ? 'Sending…' : 'OFF'}
                      icon={<Power size={16} />}
                      active={!fanRunning && !fan30Active && !fan60Active}
                      onClick={handleFanOff}
                      disabled={sendingPower !== ''}
                    />
                    <CommandButton
                      label={sendingSpeed === '30' ? 'Sending…' : '30 Hz'}
                      icon={<Zap size={16} />}
                      active={fan30Active}
                      onClick={() => handleSetFanSpeed(30)}
                      disabled={sendingSpeed !== ''}
                    />
                    <CommandButton
                      label={sendingSpeed === '60' ? 'Sending…' : '60 Hz'}
                      icon={<Zap size={16} />}
                      active={fan60Active}
                      onClick={() => handleSetFanSpeed(60)}
                      disabled={sendingSpeed !== ''}
                    />
                    <CommandButton
                      label={resettingAlert ? 'Resetting…' : 'RESET ALERT'}
                      icon={<RotateCcw size={16} />}
                      danger
                      onClick={openResetAlertModal}
                      disabled={resettingAlert}
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
                    if (e.key === 'Enter') confirmResetAlertWithPin()
                    if (e.key === 'Escape') closeResetAlertModal()
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
