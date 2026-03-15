import React, { useMemo } from 'react'

function getBoolean(points, codePart) {
  const point = points.find((p) => String(p.point_code || '').toUpperCase().includes(codePart))
  return point?.value_boolean === true
}

function getNumber(points, codePart, fallback = null) {
  const point = points.find((p) => String(p.point_code || '').toUpperCase().includes(codePart))
  const value = point?.value_number
  return typeof value === 'number' && !Number.isNaN(value) ? value : fallback
}

function getStatus(points) {
  const onlinePoint = points.find((p) => String(p.point_code || '').toUpperCase() === 'ONLINE')
  const online = onlinePoint?.value_boolean ?? true

  const alarmPoint =
    points.find((p) => String(p.point_code || '').toUpperCase().includes('ALARM')) ||
    points.find((p) => String(p.point_code || '').toUpperCase().includes('FAULT'))

  const alarm = alarmPoint?.value_boolean === true

  return { online, alarm }
}

function getCompressors(points) {
  const compPoints = points.filter(
    (p) =>
      p.point_group === 'compressors' ||
      String(p.point_code || '').toUpperCase().includes('COMP')
  )

  const map = new Map()

  compPoints.forEach((p) => {
    const raw = String(p.point_code || '').toUpperCase()
    const match =
      raw.match(/COMP[_-]?([A-Z0-9]+)/) ||
      raw.match(/C([1-9][A-Z]?)/)

    const key = match?.[1] || raw

    if (!map.has(key)) {
      map.set(key, { key, on: false })
    }

    if (p.value_boolean === true) {
      map.get(key).on = true
    }
  })

  const items = Array.from(map.values())

  if (!items.length) {
    return [
      { key: 'A', on: getBoolean(points, 'COMP_A') || getBoolean(points, 'COMP1') },
      { key: 'B', on: getBoolean(points, 'COMP_B') || getBoolean(points, 'COMP2') },
    ]
  }

  return items.slice(0, 6)
}

function formatTemp(value) {
  if (typeof value !== 'number') return '--'
  return `${value.toFixed(1)}°F`
}

function tempColor(value, type) {
  if (typeof value !== 'number') return '#e2e8f0'
  if (type === 'blue') {
    if (value <= 42) return '#67e8f9'
    if (value <= 55) return '#38bdf8'
    return '#93c5fd'
  }
  if (value >= 100) return '#f97316'
  if (value >= 80) return '#fb7185'
  return '#fda4af'
}

function labelCardStyle(borderColor) {
  return {
    fill: 'rgba(15,23,42,0.88)',
    stroke: borderColor,
    strokeWidth: 1.5,
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

  const chwIn = getNumber(points, 'ECHW', getNumber(points, 'ENTERING', null))
  const chwOut = getNumber(points, 'LCHW', getNumber(points, 'LEAVING', null))
  const condIn = getNumber(points, 'ECW', getNumber(points, 'COND_ENTERING', null))
  const condOut = getNumber(points, 'LCW', getNumber(points, 'COND_LEAVING', null))

  const width = 980
  const height = 360

  const frameStroke = selected
    ? 'rgba(34, 211, 238, 0.95)'
    : 'rgba(148, 163, 184, 0.25)'

  const outerGlow = selected
    ? '0 0 0 1px rgba(34, 211, 238, 0.3), 0 18px 40px rgba(8, 47, 73, 0.55)'
    : '0 16px 36px rgba(2, 6, 23, 0.45)'

  const cardBg = alarm
    ? 'linear-gradient(180deg, rgba(69,10,10,0.78) 0%, rgba(24,24,27,0.92) 100%)'
    : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)'

  const chillerX = 385
  const chillerY = 88
  const chillerW = 210
  const chillerH = 120

  const topY = 105
  const bottomY = 225
  const leftX = 70
  const rightX = 910
  const centerLeft = chillerX
  const centerRight = chillerX + chillerW

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
          marginBottom: 12,
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
          width: '100%',
          overflow: 'hidden',
          borderRadius: 22,
          border: '1px solid rgba(148,163,184,0.14)',
          background:
            'radial-gradient(circle at 20% 0%, rgba(8,145,178,0.10), transparent 35%), linear-gradient(180deg, rgba(2,6,23,0.92), rgba(3,7,18,0.98))',
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        >
          <defs>
            <filter id="softGlowBlue">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="softGlowRed">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="chillerBodyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f2d4a" />
              <stop offset="100%" stopColor="#111b31" />
            </linearGradient>

            <linearGradient id="innerCoreGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#18243d" />
              <stop offset="100%" stopColor="#0d1629" />
            </linearGradient>
          </defs>

          {/* top blue line */}
          <path
            d={`M ${leftX} ${topY} H ${centerLeft} M ${centerRight} ${topY} H ${rightX}`}
            stroke="#38bdf8"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowBlue)"
          />

          {/* bottom red line */}
          <path
            d={`M ${leftX} ${bottomY} H ${centerLeft} M ${centerRight} ${bottomY} H ${rightX}`}
            stroke="#fb7185"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowRed)"
          />

          {/* arrows */}
          <polygon points="300,105 282,96 282,114" fill="#7dd3fc" />
          <polygon points="680,105 698,96 698,114" fill="#7dd3fc" />
          <polygon points="680,225 662,216 662,234" fill="#fda4af" />
          <polygon points="300,225 318,216 318,234" fill="#fda4af" />

          {/* animated dots */}
          {online && (
            <>
              <circle r="5.5" fill="#7dd3fc" filter="url(#softGlowBlue)">
                <animateMotion dur="2.8s" repeatCount="indefinite" path={`M ${leftX} ${topY} H ${centerLeft - 8}`} />
              </circle>
              <circle r="5.5" fill="#7dd3fc" filter="url(#softGlowBlue)">
                <animateMotion dur="2.8s" repeatCount="indefinite" path={`M ${centerRight + 8} ${topY} H ${rightX}`} />
              </circle>

              <circle r="5.5" fill="#fda4af" filter="url(#softGlowRed)">
                <animateMotion dur="2.8s" repeatCount="indefinite" path={`M ${rightX} ${bottomY} H ${centerRight + 8}`} />
              </circle>
              <circle r="5.5" fill="#fda4af" filter="url(#softGlowRed)">
                <animateMotion dur="2.8s" repeatCount="indefinite" path={`M ${centerLeft - 8} ${bottomY} H ${leftX}`} />
              </circle>
            </>
          )}

          {/* left blue temp card */}
          <rect x="35" y="55" rx="18" ry="18" width="170" height="62" {...labelCardStyle('rgba(56,189,248,0.35)')} />
          <text x="55" y="78" fill="#7dd3fc" fontSize="14" fontWeight="900">CHW IN</text>
          <text x="55" y="102" fill={tempColor(chwIn, 'blue')} fontSize="22" fontWeight="900">
            {formatTemp(chwIn)}
          </text>

          {/* right blue temp card */}
          <rect x="775" y="55" rx="18" ry="18" width="170" height="62" {...labelCardStyle('rgba(56,189,248,0.35)')} />
          <text x="925" y="78" fill="#7dd3fc" fontSize="14" fontWeight="900" textAnchor="end">CHW OUT</text>
          <text x="925" y="102" fill={tempColor(chwOut, 'blue')} fontSize="22" fontWeight="900" textAnchor="end">
            {formatTemp(chwOut)}
          </text>

          {/* left red temp card */}
          <rect x="35" y="193" rx="18" ry="18" width="170" height="62" {...labelCardStyle('rgba(251,113,133,0.35)')} />
          <text x="55" y="216" fill="#fda4af" fontSize="14" fontWeight="900">COND OUT</text>
          <text x="55" y="240" fill={tempColor(condOut, 'red')} fontSize="22" fontWeight="900">
            {formatTemp(condOut)}
          </text>

          {/* right red temp card */}
          <rect x="775" y="193" rx="18" ry="18" width="170" height="62" {...labelCardStyle('rgba(251,113,133,0.35)')} />
          <text x="925" y="216" fill="#fda4af" fontSize="14" fontWeight="900" textAnchor="end">COND IN</text>
          <text x="925" y="240" fill={tempColor(condIn, 'red')} fontSize="22" fontWeight="900" textAnchor="end">
            {formatTemp(condIn)}
          </text>

          {/* central chiller */}
          <rect
            x={chillerX}
            y={chillerY}
            rx="28"
            ry="28"
            width={chillerW}
            height={chillerH}
            fill="url(#chillerBodyGrad)"
            stroke="rgba(148,163,184,0.24)"
            strokeWidth="2"
          />

          <rect
            x={chillerX + 20}
            y={chillerY + 18}
            rx="18"
            ry="18"
            width={chillerW - 40}
            height={chillerH - 36}
            fill="url(#innerCoreGrad)"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth="1.4"
          />

          {/* center connections */}
          <circle cx={centerLeft} cy={topY} r="7" fill="#7dd3fc" />
          <circle cx={centerRight} cy={topY} r="7" fill="#7dd3fc" />
          <circle cx={centerLeft} cy={bottomY} r="7" fill="#fda4af" />
          <circle cx={centerRight} cy={bottomY} r="7" fill="#fda4af" />

          {/* exchanger symbol */}
          <rect
            x={chillerX + 48}
            y={chillerY + 38}
            rx="14"
            ry="14"
            width={chillerW - 96}
            height="44"
            fill="rgba(15,23,42,0.78)"
            stroke="rgba(103,232,249,0.55)"
            strokeWidth="1.8"
          />

          {[0, 1, 2, 3].map((i) => {
            const x = chillerX + 68 + i * 24
            return (
              <path
                key={i}
                d={`M ${x} ${chillerY + 46} Q ${x + 12} ${chillerY + 60} ${x} ${chillerY + 74}`}
                stroke="#67e8f9"
                strokeWidth="2.6"
                fill="none"
                strokeLinecap="round"
              />
            )
          })}

          <text
            x={chillerX + chillerW / 2}
            y={chillerY + 105}
            fill="#e2e8f0"
            fontSize="16"
            fontWeight="900"
            textAnchor="middle"
            letterSpacing="1.1"
          >
            CHILLER
          </text>

          {/* compressor status bottom */}
          <text
            x="490"
            y="292"
            fill="#94a3b8"
            fontSize="13"
            fontWeight="900"
            textAnchor="middle"
            letterSpacing="1.2"
          >
            COMPRESSOR STATUS
          </text>

          {compressors.slice(0, 6).map((comp, index) => {
            const total = Math.min(compressors.length, 6)
            const startX = 490 - ((total - 1) * 34) / 2
            const cx = startX + index * 34
            const cy = 318

            return (
              <g key={comp.key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="11"
                  fill={comp.on ? '#22c55e' : '#475569'}
                  stroke={comp.on ? '#86efac' : '#64748b'}
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy + 28}
                  fill="#cbd5e1"
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {comp.key}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div
        style={{
          marginTop: 12,
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
    </button>
  )
}
