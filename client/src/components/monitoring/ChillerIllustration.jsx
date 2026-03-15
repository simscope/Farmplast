import React, { useMemo } from 'react'

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

function getStatus(points) {
  const onlinePoint = findPointByAliases(points, ['ONLINE', 'COMM', 'COMMUNICATION', 'CONNECTED'])
  let online = true

  if (onlinePoint) {
    if (typeof onlinePoint.value_boolean === 'boolean') {
      online = onlinePoint.value_boolean
    } else {
      const parsed = parseNumericValue(onlinePoint)
      if (parsed !== null) online = parsed === 1
    }
  }

  const alarm =
    getBoolean(points, ['ALARM']) ||
    getBoolean(points, ['FAULT']) ||
    getBoolean(points, ['TRIP'])

  return { online, alarm }
}

function getCompressors(points) {
  const aliases = [
    { key: 'A', terms: ['COMPRESSOR A', 'COMP A', 'COMP_A', 'COMP-A', 'COMP1', 'COMP 1'] },
    { key: 'B', terms: ['COMPRESSOR B', 'COMP B', 'COMP_B', 'COMP-B', 'COMP2', 'COMP 2'] },
    { key: 'C', terms: ['COMPRESSOR C', 'COMP C', 'COMP_C', 'COMP-C', 'COMP3', 'COMP 3'] },
    { key: 'D', terms: ['COMPRESSOR D', 'COMP D', 'COMP_D', 'COMP-D', 'COMP4', 'COMP 4'] },
    { key: 'E', terms: ['COMPRESSOR E', 'COMP E', 'COMP_E', 'COMP-E', 'COMP5', 'COMP 5'] },
    { key: 'F', terms: ['COMPRESSOR F', 'COMP F', 'COMP_F', 'COMP-F', 'COMP6', 'COMP 6'] },
  ]

  const result = aliases
    .map((item) => ({
      key: item.key,
      on: getBoolean(points, item.terms),
    }))
    .filter((item, index) => {
      if (index < 2) return true
      return item.on
    })

  return result.length ? result : [{ key: 'A', on: false }, { key: 'B', on: false }]
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

function tempBlockStyle(accent, selected) {
  return {
    padding: '12px 14px',
    borderRadius: 18,
    background: 'rgba(8,15,30,0.72)',
    border: `1px solid ${selected ? accent : 'rgba(148,163,184,0.14)'}`,
    boxShadow: selected ? `0 0 0 1px ${accent}22 inset` : 'none',
  }
}

export default function ChillerIllustration({
  asset,
  selected = false,
  onSelect,
  isMobile = false,
}) {
  const points = Array.isArray(asset?.points) ? asset.points : []

  const { online, alarm } = useMemo(() => getStatus(points), [points])
  const compressors = useMemo(() => getCompressors(points), [points])

  const chwIn = getTemperature(points, [
    'ECHW',
    'CHILLED WATER IN',
    'CHW IN',
    'ENTERING CHILLED WATER',
    'EVAP WATER IN',
  ])

  const chwOut = getTemperature(points, [
    'LCHW',
    'CHILLED WATER OUT',
    'CHW OUT',
    'LEAVING CHILLED WATER',
    'EVAP WATER OUT',
  ])

  const condIn = getTemperature(points, [
    'ECW',
    'CONDENSER WATER IN',
    'COND IN',
    'ENTERING CONDENSER WATER',
  ])

  const condOut = getTemperature(points, [
    'LCW',
    'CONDENSER WATER OUT',
    'COND OUT',
    'LEAVING CONDENSER WATER',
  ])

  const frameStroke = selected
    ? 'rgba(34, 211, 238, 0.95)'
    : 'rgba(148, 163, 184, 0.25)'

  const outerGlow = selected
    ? '0 0 0 1px rgba(34, 211, 238, 0.3), 0 18px 40px rgba(8, 47, 73, 0.55)'
    : '0 16px 36px rgba(2, 6, 23, 0.45)'

  const cardBg = alarm
    ? 'linear-gradient(180deg, rgba(69,10,10,0.78) 0%, rgba(24,24,27,0.92) 100%)'
    : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)'

  const blueAccent = 'rgba(56,189,248,0.38)'
  const redAccent = 'rgba(251,113,133,0.38)'

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
      }}
    >
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
              color: '#67e8f9',
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
            {asset?.name || asset?.asset_code || 'Unnamed chiller'}
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
                fontWeight: 800,
                background: 'rgba(251,146,60,0.16)',
                color: '#fb923c',
                border: '1px solid rgba(251,146,60,0.28)',
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
          border: '1px solid rgba(148,163,184,0.14)',
          background:
            'radial-gradient(circle at 20% 0%, rgba(8,145,178,0.10), transparent 35%), linear-gradient(180deg, rgba(2,6,23,0.92), rgba(3,7,18,0.98))',
          padding: isMobile ? 12 : 18,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '220px 1fr 220px',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={tempBlockStyle(blueAccent, selected)}>
              <div style={{ color: '#7dd3fc', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
                CHW IN
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: tempColor(chwIn, 'blue'),
                  fontSize: 28,
                  fontWeight: 900,
                }}
              >
                {formatTemp(chwIn)}
              </div>
              <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                entering chilled water
              </div>
            </div>

            <div style={tempBlockStyle(redAccent, selected)}>
              <div style={{ color: '#fda4af', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
                COND OUT
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: tempColor(condOut, 'red'),
                  fontSize: 28,
                  fontWeight: 900,
                }}
              >
                {formatTemp(condOut)}
              </div>
              <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                leaving condenser water
              </div>
            </div>
          </div>

          <div
            style={{
              minHeight: isMobile ? 250 : 300,
              borderRadius: 24,
              position: 'relative',
              overflow: 'hidden',
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.72), rgba(10,15,28,0.88))',
              border: '1px solid rgba(148,163,184,0.12)',
            }}
          >
            <svg
              viewBox="0 0 560 300"
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
                  <stop offset="0%" stopColor="#1b2945" />
                  <stop offset="100%" stopColor="#10192f" />
                </linearGradient>

                <linearGradient id="hxInner" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#24324d" />
                  <stop offset="100%" stopColor="#111a2f" />
                </linearGradient>
              </defs>

              {/* blue path */}
              <path
                d="M 20 75 H 155"
                stroke="#38bdf8"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowBlue)"
              />
              <path
                d="M 405 75 H 540"
                stroke="#38bdf8"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowBlue)"
              />

              {/* red path */}
              <path
                d="M 20 225 H 155"
                stroke="#fb7185"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowRed)"
              />
              <path
                d="M 405 225 H 540"
                stroke="#fb7185"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                filter="url(#glowRed)"
              />

              {/* animated dots */}
              {online && (
                <>
                  <circle r="5.5" fill="#7dd3fc" filter="url(#glowBlue)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 20 75 H 155" />
                  </circle>
                  <circle r="5.5" fill="#7dd3fc" filter="url(#glowBlue)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 405 75 H 540" />
                  </circle>

                  <circle r="5.5" fill="#fda4af" filter="url(#glowRed)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 540 225 H 405" />
                  </circle>
                  <circle r="5.5" fill="#fda4af" filter="url(#glowRed)">
                    <animateMotion dur="2.6s" repeatCount="indefinite" path="M 155 225 H 20" />
                  </circle>
                </>
              )}

              {/* exchanger */}
              <rect
                x="155"
                y="42"
                width="250"
                height="216"
                rx="34"
                ry="34"
                fill="url(#hxShell)"
                stroke="rgba(148,163,184,0.28)"
                strokeWidth="2"
              />

              <rect
                x="182"
                y="66"
                width="196"
                height="168"
                rx="22"
                ry="22"
                fill="url(#hxInner)"
                stroke="rgba(148,163,184,0.12)"
                strokeWidth="1.4"
              />

              {/* nozzles */}
              <circle cx="155" cy="75" r="7" fill="#7dd3fc" />
              <circle cx="405" cy="75" r="7" fill="#7dd3fc" />
              <circle cx="155" cy="225" r="7" fill="#fda4af" />
              <circle cx="405" cy="225" r="7" fill="#fda4af" />

              {/* plate pack */}
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const x = 214 + i * 22
                return (
                  <line
                    key={i}
                    x1={x}
                    y1="92"
                    x2={x + 34}
                    y2="208"
                    stroke={i % 2 === 0 ? '#67e8f9' : '#fda4af'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                )
              })}

              {/* labels */}
              <text x="280" y="128" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
                PLATE HEAT
              </text>
              <text x="280" y="150" fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
                EXCHANGER
              </text>

              <text x="280" y="182" fill="#64748b" fontSize="12" fontWeight="800" textAnchor="middle">
                illustrative process view
              </text>

              {/* comp */}
              <text x="280" y="278" fill="#94a3b8" fontSize="12" fontWeight="900" textAnchor="middle">
                COMPRESSORS
              </text>
            </svg>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 14,
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              {compressors.slice(0, 6).map((comp) => (
                <div
                  key={comp.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(8,15,30,0.75)',
                    border: '1px solid rgba(148,163,184,0.14)',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: comp.on ? '#22c55e' : '#475569',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800 }}>
                    {comp.key}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={tempBlockStyle(blueAccent, selected)}>
              <div style={{ color: '#7dd3fc', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
                CHW OUT
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: tempColor(chwOut, 'blue'),
                  fontSize: 28,
                  fontWeight: 900,
                }}
              >
                {formatTemp(chwOut)}
              </div>
              <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                leaving chilled water
              </div>
            </div>

            <div style={tempBlockStyle(redAccent, selected)}>
              <div style={{ color: '#fda4af', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
                COND IN
              </div>
              <div
                style={{
                  marginTop: 6,
                  color: tempColor(condIn, 'red'),
                  fontSize: 28,
                  fontWeight: 900,
                }}
              >
                {formatTemp(condIn)}
              </div>
              <div style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                entering condenser water
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.72)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ECHW / CHW IN</div>
            <div style={{ marginTop: 4, color: tempColor(chwIn, 'blue'), fontWeight: 900 }}>
              {formatTemp(chwIn)}
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.72)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>LCHW / CHW OUT</div>
            <div style={{ marginTop: 4, color: tempColor(chwOut, 'blue'), fontWeight: 900 }}>
              {formatTemp(chwOut)}
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.72)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ECW / COND IN</div>
            <div style={{ marginTop: 4, color: tempColor(condIn, 'red'), fontWeight: 900 }}>
              {formatTemp(condIn)}
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(15,23,42,0.72)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>LCW / COND OUT</div>
            <div style={{ marginTop: 4, color: tempColor(condOut, 'red'), fontWeight: 900 }}>
              {formatTemp(condOut)}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
