import React, { useMemo } from 'react'
import { getAssetStatus } from '../../utils/monitoringHelpers'

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

function isSixCompressorAsset(assetCode) {
  const code = String(assetCode || '').toUpperCase()
  return code === 'CH-NJ-02' || code === 'CH-NJ-03' || code === 'CH2' || code === 'CH3'
}

function getCompressorLayout(assetCode) {
  if (isSixCompressorAsset(assetCode)) {
    return [
      {
        key: '1A',
        terms: [
          'COMPRESSOR 1A',
          'COMP 1A',
          'COMP_1A',
          'COMP1A',
          '1A STATUS',
          'SECTION 1 A',
          'CIRCUIT 1 A',
          'COMPRESSOR_1A_STATUS',
          'CH2_COMP_1A_STATUS',
          'CH3_COMP_1A_STATUS',
        ],
      },
      {
        key: '1B',
        terms: [
          'COMPRESSOR 1B',
          'COMP 1B',
          'COMP_1B',
          'COMP1B',
          '1B STATUS',
          'SECTION 1 B',
          'CIRCUIT 1 B',
          'COMPRESSOR_1B_STATUS',
          'CH2_COMP_1B_STATUS',
          'CH3_COMP_1B_STATUS',
        ],
      },
      {
        key: '1C',
        terms: [
          'COMPRESSOR 1C',
          'COMP 1C',
          'COMP_1C',
          'COMP1C',
          '1C STATUS',
          'SECTION 1 C',
          'CIRCUIT 1 C',
          'COMPRESSOR_1C_STATUS',
          'CH2_COMP_1C_STATUS',
          'CH3_COMP_1C_STATUS',
        ],
      },
      {
        key: '2A',
        terms: [
          'COMPRESSOR 2A',
          'COMP 2A',
          'COMP_2A',
          'COMP2A',
          '2A STATUS',
          'SECTION 2 A',
          'CIRCUIT 2 A',
          'COMPRESSOR_2A_STATUS',
          'CH2_COMP_2A_STATUS',
          'CH3_COMP_2A_STATUS',
        ],
      },
      {
        key: '2B',
        terms: [
          'COMPRESSOR 2B',
          'COMP 2B',
          'COMP_2B',
          'COMP2B',
          '2B STATUS',
          'SECTION 2 B',
          'CIRCUIT 2 B',
          'COMPRESSOR_2B_STATUS',
          'CH2_COMP_2B_STATUS',
          'CH3_COMP_2B_STATUS',
        ],
      },
      {
        key: '2C',
        terms: [
          'COMPRESSOR 2C',
          'COMP 2C',
          'COMP_2C',
          'COMP2C',
          '2C STATUS',
          'SECTION 2 C',
          'CIRCUIT 2 C',
          'COMPRESSOR_2C_STATUS',
          'CH2_COMP_2C_STATUS',
          'CH3_COMP_2C_STATUS',
        ],
      },
    ]
  }

  return [
    {
      key: 'A',
      terms: [
        'COMPRESSOR A',
        'COMP A',
        'COMP_A',
        'COMP-A',
        'COMP1',
        'COMP 1',
        'CH1_COMP_A_STATUS',
        'COMP_A_STATUS',
      ],
    },
    {
      key: 'B',
      terms: [
        'COMPRESSOR B',
        'COMP B',
        'COMP_B',
        'COMP-B',
        'COMP2',
        'COMP 2',
        'CH1_COMP_B_STATUS',
        'COMP_B_STATUS',
      ],
    },
  ]
}

function getCompressors(points, assetCode) {
  const layout = getCompressorLayout(assetCode)
  return layout.map((item) => ({
    key: item.key,
    on: getBoolean(points, item.terms),
  }))
}

function formatTemp(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${value.toFixed(1)}°F`
}

function tempColor(value, family) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '#e2e8f0'

  if (family === 'blue') {
    if (value <= 42) return '#67e8f9'
    if (value <= 55) return '#38bdf8'
    if (value <= 65) return '#60a5fa'
    return '#93c5fd'
  }

  if (value >= 100) return '#f97316'
  if (value >= 85) return '#fb7185'
  if (value >= 70) return '#fda4af'
  return '#fecdd3'
}

function tempBlockStyle(accent, selected, alarm = false) {
  return {
    padding: '12px 14px',
    borderRadius: 18,
    background: alarm ? 'rgba(38, 10, 16, 0.72)' : 'rgba(8,15,30,0.72)',
    border: `1px solid ${alarm ? 'rgba(248,113,113,0.28)' : selected ? accent : 'rgba(148,163,184,0.14)'}`,
    boxShadow: selected
      ? `0 0 0 1px ${accent}22 inset`
      : alarm
        ? '0 0 0 1px rgba(248,113,113,0.08) inset'
        : 'none',
    minHeight: 112,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  }
}

function getFluidTemps(points, assetCode) {
  if (isSixCompressorAsset(assetCode)) {
    const in1 = getTemperature(points, [
      'CH2_CHW_IN',
      'CH3_CHW_IN',
      'CHILLER 1 ENTERING FLUID TEMP',
      'SECTION 1 ENTERING FLUID TEMP',
      'CIRCUIT 1 ENTERING FLUID TEMP',
      'ENTERING FLUID TEMP 1',
      'FLUID IN 1',
      'CHW IN 1',
    ])

    const out1 = getTemperature(points, [
      'CH2_CHW_OUT',
      'CH3_CHW_OUT',
      'CHILLER 1 LEAVING FLUID TEMP',
      'SECTION 1 LEAVING FLUID TEMP',
      'CIRCUIT 1 LEAVING FLUID TEMP',
      'LEAVING FLUID TEMP 1',
      'FLUID OUT 1',
      'CHW OUT 1',
    ])

    const in2 = getTemperature(
      points,
      [
        'CH2_CHW_IN_2',
        'CH3_CHW_IN_2',
        'CHILLER 2 ENTERING FLUID TEMP',
        'SECTION 2 ENTERING FLUID TEMP',
        'CIRCUIT 2 ENTERING FLUID TEMP',
        'ENTERING FLUID TEMP 2',
        'FLUID IN 2',
        'CHW IN 2',
      ],
      in1
    )

    const out2 = getTemperature(
      points,
      [
        'CH2_CHW_OUT_2',
        'CH3_CHW_OUT_2',
        'CHILLER 2 LEAVING FLUID TEMP',
        'SECTION 2 LEAVING FLUID TEMP',
        'CIRCUIT 2 LEAVING FLUID TEMP',
        'LEAVING FLUID TEMP 2',
        'FLUID OUT 2',
        'CHW OUT 2',
      ],
      out1
    )

    return { in1, out1, in2, out2 }
  }

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

  return {
    in1: chwIn,
    out1: chwOut,
    in2: condIn,
    out2: condOut,
  }
}

function TempCard({ label, value, family, subtitle, selected, alarm }) {
  const accent = family === 'blue' ? 'rgba(56,189,248,0.38)' : 'rgba(251,113,133,0.38)'
  const labelColor = family === 'blue' ? '#7dd3fc' : '#fda4af'

  return (
    <div style={tempBlockStyle(accent, selected, alarm)}>
      <div style={{ color: labelColor, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: tempColor(value, family),
          fontSize: 28,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {formatTemp(value)}
      </div>
      <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
        {subtitle}
      </div>
    </div>
  )
}

function CompressorPill({ comp, wide = false, alarm = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 11px',
        borderRadius: 999,
        background: alarm ? 'rgba(34, 10, 16, 0.84)' : 'rgba(8,15,30,0.78)',
        border: `1px solid ${alarm ? 'rgba(248,113,113,0.22)' : 'rgba(148,163,184,0.14)'}`,
        minWidth: wide ? 62 : 46,
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: comp.on ? '#22c55e' : '#475569',
          display: 'inline-block',
          boxShadow: comp.on ? '0 0 10px rgba(34,197,94,0.55)' : 'none',
        }}
      />
      <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800 }}>
        {comp.key}
      </span>
    </div>
  )
}

export default function ChillerIllustration({
  asset,
  selected = false,
  onSelect,
  isMobile = false,
}) {
  const points = Array.isArray(asset?.points) ? asset.points : []
  const assetCode = String(asset?.asset_code || '').toUpperCase()
  const sixComp = isSixCompressorAsset(assetCode)

  const { online, alarm } = useMemo(() => getAssetStatus(asset), [asset])
  const compressors = useMemo(() => getCompressors(points, assetCode), [points, assetCode])
  const fluidTemps = useMemo(() => getFluidTemps(points, assetCode), [points, assetCode])

  const normalFrameStroke = selected
    ? 'rgba(34, 211, 238, 0.95)'
    : 'rgba(148, 163, 184, 0.25)'

  const frameStroke = alarm ? 'rgba(248, 113, 113, 0.82)' : normalFrameStroke

  const normalOuterGlow = selected
    ? '0 0 0 1px rgba(34, 211, 238, 0.3), 0 18px 40px rgba(8, 47, 73, 0.55)'
    : '0 16px 36px rgba(2, 6, 23, 0.45)'

  const alarmOuterGlow =
    '0 0 0 1px rgba(248,113,113,0.32), 0 0 22px rgba(239,68,68,0.18), 0 20px 42px rgba(60,10,16,0.55)'

  const outerGlow = alarm ? alarmOuterGlow : normalOuterGlow

  const cardBg = alarm
    ? 'linear-gradient(180deg, rgba(58,10,18,0.92) 0%, rgba(24,10,16,0.96) 35%, rgba(10,10,18,0.98) 100%)'
    : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)'

  const leftTopLabel = sixComp ? 'CHILLER IN 1' : 'CHW IN'
  const rightTopLabel = sixComp ? 'CHILLER OUT 1' : 'CHW OUT'
  const leftBottomLabel = sixComp ? 'CHILLER IN 2' : 'COND IN'
  const rightBottomLabel = sixComp ? 'CHILLER OUT 2' : 'COND OUT'

  const leftTopSubtitle = sixComp ? 'section 1 entering fluid' : 'entering chilled water'
  const rightTopSubtitle = sixComp ? 'section 1 leaving fluid' : 'leaving chilled water'
  const leftBottomSubtitle = sixComp ? 'section 2 entering fluid' : 'entering condenser water'
  const rightBottomSubtitle = sixComp ? 'section 2 leaving fluid' : 'leaving condenser water'

  const compRow1 = sixComp ? compressors.slice(0, 3) : compressors
  const compRow2 = sixComp ? compressors.slice(3, 6) : []

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        border: `1px solid ${frameStroke}`,
        background: cardBg,
        borderRadius: 28,
        padding: isMobile ? 14 : 18,
        color: '#f8fafc',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: outerGlow,
        animation: alarm ? 'chillerAlarmPulse 1.2s ease-in-out infinite' : 'none',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes chillerAlarmPulse {
          0% {
            box-shadow:
              0 0 0 1px rgba(248,113,113,0.18),
              0 0 10px rgba(239,68,68,0.10),
              0 16px 34px rgba(35,8,14,0.45);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(248,113,113,0.50),
              0 0 24px rgba(239,68,68,0.24),
              0 24px 48px rgba(60,10,16,0.62);
          }
          100% {
            box-shadow:
              0 0 0 1px rgba(248,113,113,0.18),
              0 0 10px rgba(239,68,68,0.10),
              0 16px 34px rgba(35,8,14,0.45);
          }
        }

        @keyframes alarmBadgeBlink {
          0% { opacity: 0.72; }
          50% { opacity: 1; }
          100% { opacity: 0.72; }
        }

        @keyframes alarmInnerBlink {
          0% { border-color: rgba(248,113,113,0.12); }
          50% { border-color: rgba(248,113,113,0.30); }
          100% { border-color: rgba(248,113,113,0.12); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 1.1,
              color: alarm ? '#fda4af' : '#67e8f9',
            }}
          >
            CHILLER
          </div>
          <div
            style={{
              fontSize: isMobile ? 20 : 24,
              fontWeight: 900,
              marginTop: 4,
            }}
          >
            {asset?.name || asset?.asset_name || asset?.asset_code || 'Unnamed chiller'}
          </div>
          <div
            style={{
              marginTop: 4,
              color: '#94a3b8',
              fontSize: 13,
            }}
          >
            {asset?.asset_code || '—'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              background: online ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
              color: online ? '#4ade80' : '#f87171',
              border: `1px solid ${online ? 'rgba(74,222,128,0.28)' : 'rgba(248,113,113,0.28)'}`,
            }}
          >
            {online ? 'ONLINE' : 'OFFLINE'}
          </div>

          {alarm ? (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                background: 'rgba(127,29,29,0.34)',
                color: '#fca5a5',
                border: '1px solid rgba(248,113,113,0.42)',
                animation: 'alarmBadgeBlink 0.9s ease-in-out infinite',
              }}
            >
              ALARM
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          borderRadius: 22,
          border: alarm
            ? '1px solid rgba(248,113,113,0.18)'
            : '1px solid rgba(148,163,184,0.14)',
          background: alarm
            ? 'radial-gradient(circle at 20% 0%, rgba(127,29,29,0.16), transparent 35%), linear-gradient(180deg, rgba(24,6,12,0.92), rgba(8,7,14,0.98))'
            : 'radial-gradient(circle at 20% 0%, rgba(8,145,178,0.10), transparent 35%), linear-gradient(180deg, rgba(2,6,23,0.92), rgba(3,7,18,0.98))',
          padding: isMobile ? 12 : 18,
          animation: alarm ? 'alarmInnerBlink 1.2s ease-in-out infinite' : 'none',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '220px minmax(260px, 330px) 220px',
            gap: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <TempCard
              label={leftTopLabel}
              value={fluidTemps.in1}
              family="blue"
              subtitle={leftTopSubtitle}
              selected={selected}
              alarm={alarm}
            />

            <TempCard
              label={leftBottomLabel}
              value={fluidTemps.in2}
              family={sixComp ? 'blue' : 'red'}
              subtitle={leftBottomSubtitle}
              selected={selected}
              alarm={alarm}
            />
          </div>

          <div
            style={{
              minHeight: isMobile ? 220 : 250,
              maxWidth: 330,
              width: '100%',
              margin: '0 auto',
              borderRadius: 24,
              position: 'relative',
              overflow: 'hidden',
              background: alarm
                ? 'linear-gradient(180deg, rgba(30,10,16,0.80), rgba(14,8,14,0.92))'
                : 'linear-gradient(180deg, rgba(15,23,42,0.72), rgba(10,15,28,0.88))',
              border: alarm
                ? '1px solid rgba(248,113,113,0.18)'
                : '1px solid rgba(148,163,184,0.12)',
            }}
          >
            <svg
              viewBox="0 0 560 316"
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

                <linearGradient id="hxShell" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={alarm ? '#3a1620' : '#1b2945'} />
                  <stop offset="100%" stopColor={alarm ? '#1d1117' : '#10192f'} />
                </linearGradient>

                <linearGradient id="hxInner" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={alarm ? '#45212a' : '#24324d'} />
                  <stop offset="100%" stopColor={alarm ? '#1d1217' : '#111a2f'} />
                </linearGradient>
              </defs>

              <path
                d="M 38 82 H 152"
                stroke="#38bdf8"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowBlue)"
              />
              <path
                d="M 408 82 H 522"
                stroke="#38bdf8"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowBlue)"
              />

              <path
                d="M 38 228 H 152"
                stroke={sixComp ? '#38bdf8' : '#fb7185'}
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter={sixComp ? 'url(#glowBlue)' : 'url(#glowRed)'}
              />
              <path
                d="M 408 228 H 522"
                stroke={sixComp ? '#38bdf8' : '#fb7185'}
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter={sixComp ? 'url(#glowBlue)' : 'url(#glowRed)'}
              />

              {online && (
                <>
                  <circle r="5.5" fill="#7dd3fc" filter="url(#glowBlue)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 38 82 H 152" />
                  </circle>
                  <circle r="5.5" fill="#7dd3fc" filter="url(#glowBlue)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 408 82 H 522" />
                  </circle>

                  <circle
                    r="5.5"
                    fill={sixComp ? '#7dd3fc' : '#fda4af'}
                    filter={sixComp ? 'url(#glowBlue)' : 'url(#glowRed)'}
                  >
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 38 228 H 152" />
                  </circle>
                  <circle
                    r="5.5"
                    fill={sixComp ? '#7dd3fc' : '#fda4af'}
                    filter={sixComp ? 'url(#glowBlue)' : 'url(#glowRed)'}
                  >
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 408 228 H 522" />
                  </circle>
                </>
              )}

              <polygon points="136,82 118,73 118,91" fill="#7dd3fc" />
              <polygon points="424,82 442,73 442,91" fill="#7dd3fc" />
              <polygon
                points="136,228 118,219 118,237"
                fill={sixComp ? '#7dd3fc' : '#fda4af'}
              />
              <polygon
                points="424,228 442,219 442,237"
                fill={sixComp ? '#7dd3fc' : '#fda4af'}
              />

              <rect
                x="152"
                y="38"
                width="256"
                height="198"
                rx="34"
                ry="34"
                fill="url(#hxShell)"
                stroke={alarm ? 'rgba(248,113,113,0.28)' : 'rgba(148,163,184,0.28)'}
                strokeWidth="2"
              />

              <rect
                x="186"
                y="60"
                width="188"
                height="150"
                rx="22"
                ry="22"
                fill="url(#hxInner)"
                stroke={alarm ? 'rgba(248,113,113,0.16)' : 'rgba(148,163,184,0.12)'}
                strokeWidth="1.4"
              />

              <circle cx="152" cy="82" r="7" fill="#7dd3fc" />
              <circle cx="408" cy="82" r="7" fill="#7dd3fc" />
              <circle cx="152" cy="228" r="7" fill={sixComp ? '#7dd3fc' : '#fda4af'} />
              <circle cx="408" cy="228" r="7" fill={sixComp ? '#7dd3fc' : '#fda4af'} />

              {[0, 1, 2, 3, 4, 5].map((i) => {
                const x = 220 + i * 20
                return (
                  <line
                    key={i}
                    x1={x}
                    y1="86"
                    x2={x + 30}
                    y2="186"
                    stroke={i % 2 === 0 ? '#67e8f9' : '#fda4af'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                )
              })}

              <text x="280" y="122" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
                PLATE HEAT
              </text>
              <text x="280" y="145" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
                EXCHANGER
              </text>

              <text x="280" y="172" fill="#64748b" fontSize="12" fontWeight="800" textAnchor="middle">
                inlet left / outlet right
              </text>

              <text x="280" y="192" fill="#64748b" fontSize="12" fontWeight="800" textAnchor="middle">
                {sixComp ? 'two chilled-water sections' : 'chilled + condenser circuits'}
              </text>

              <text x="280" y="276" fill="#94a3b8" fontSize="12" fontWeight="900" textAnchor="middle">
                {sixComp ? 'COMPRESSOR SECTIONS' : 'COMPRESSORS'}
              </text>
            </svg>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 14,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '0 10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {compRow1.map((comp) => (
                  <CompressorPill key={comp.key} comp={comp} wide={sixComp} alarm={alarm} />
                ))}
              </div>

              {compRow2.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  {compRow2.map((comp) => (
                    <CompressorPill key={comp.key} comp={comp} wide={sixComp} alarm={alarm} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <TempCard
              label={rightTopLabel}
              value={fluidTemps.out1}
              family="blue"
              subtitle={rightTopSubtitle}
              selected={selected}
              alarm={alarm}
            />

            <TempCard
              label={rightBottomLabel}
              value={fluidTemps.out2}
              family={sixComp ? 'blue' : 'red'}
              subtitle={rightBottomSubtitle}
              selected={selected}
              alarm={alarm}
            />
          </div>
        </div>
      </div>
    </button>
  )
}
