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
  if (value >= 95) return '#f97316'
  if (value >= 80) return '#fb7185'
  return '#fda4af'
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

  const leavingWater = getNumber(points, 'LCHW', getNumber(points, 'LEAVING', null))
  const enteringWater = getNumber(points, 'ECHW', getNumber(points, 'ENTERING', null))
  const condLeaving = getNumber(points, 'LCW', getNumber(points, 'COND_LEAVING', null))
  const condEntering = getNumber(points, 'ECW', getNumber(points, 'COND_ENTERING', null))

  const width = isMobile ? 760 : 980
  const height = isMobile ? 360 : 360

  const frameStroke = selected
    ? 'rgba(34, 211, 238, 0.95)'
    : 'rgba(148, 163, 184, 0.25)'

  const outerGlow = selected
    ? '0 0 0 1px rgba(34, 211, 238, 0.3), 0 18px 40px rgba(8, 47, 73, 0.55)'
    : '0 16px 36px rgba(2, 6, 23, 0.45)'

  const cardBg = alarm
    ? 'linear-gradient(180deg, rgba(69,10,10,0.78) 0%, rgba(24,24,27,0.92) 100%)'
    : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)'

  const shellX = 220
  const shellY = 50
  const shellW = 540
  const shellH = 210

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
            'radial-gradient(circle at 20% 0%, rgba(8,145,178,0.10), transparent 35%), linear-gradient(180deg, rgba(2,6,23,0.90), rgba(3,7,18,0.98))',
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

            <linearGradient id="shellGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1b2945" />
              <stop offset="100%" stopColor="#10192f" />
            </linearGradient>

            <linearGradient id="innerGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#24324d" />
              <stop offset="100%" stopColor="#111a2f" />
            </linearGradient>

            <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
          </defs>

          {/* CHW top left to top right */}
          <path
            d={`M 35 95 H ${shellX - 20} C ${shellX - 5} 95 ${shellX - 5} 95 ${shellX + 5} 95 H ${shellX + shellW + 20}`}
            stroke="#38bdf8"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowBlue)"
          />

          {/* COND bottom right to bottom left */}
          <path
            d={`M ${shellX + shellW + 20} 215 H ${shellX + shellW - 5} C ${shellX + shellW - 20} 215 ${shellX + shellW - 20} 215 ${shellX + shellW - 35} 215 H ${shellX - 20} H 35`}
            stroke="#fb7185"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowRed)"
          />

          {/* animated flow */}
          {online && (
            <>
              <circle r="6" fill="#7dd3fc" filter="url(#softGlowBlue)">
                <animateMotion
                  dur="3s"
                  repeatCount="indefinite"
                  path={`M 35 95 H ${shellX - 20} C ${shellX - 5} 95 ${shellX - 5} 95 ${shellX + 5} 95 H ${shellX + shellW + 20}`}
                />
              </circle>

              <circle r="6" fill="#fda4af" filter="url(#softGlowRed)">
                <animateMotion
                  dur="3s"
                  repeatCount="indefinite"
                  path={`M ${shellX + shellW + 20} 215 H ${shellX + shellW - 5} C ${shellX + shellW - 20} 215 ${shellX + shellW - 20} 215 ${shellX + shellW - 35} 215 H ${shellX - 20} H 35`}
                />
              </circle>
            </>
          )}

          {/* arrows */}
          <polygon points="145,95 128,86 128,104" fill="#7dd3fc" opacity="0.95" />
          <polygon points="845,215 862,206 862,224" fill="#fda4af" opacity="0.95" />

          {/* shell */}
          <rect
            x={shellX}
            y={shellY}
            width={shellW}
            height={shellH}
            rx="34"
            ry="34"
            fill="url(#shellGrad)"
            stroke="rgba(148,163,184,0.28)"
            strokeWidth="2.2"
          />

          <rect
            x={shellX + 28}
            y={shellY + 30}
            width={shellW - 56}
            height={shellH - 60}
            rx="24"
            ry="24"
            fill="url(#innerGrad)"
            stroke="rgba(148,163,184,0.14)"
            strokeWidth="1.5"
          />

          {/* heat exchanger body */}
          <rect
            x={shellX + 90}
            y={shellY + 78}
            width={shellW - 180}
            height={54}
            rx="16"
            ry="16"
            fill="rgba(15,23,42,0.72)"
            stroke="rgba(103,232,249,0.55)"
            strokeWidth="1.8"
          />

          {/* internal coil lines */}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = shellX + 120 + i * 48
            return (
              <path
                key={`coil-${i}`}
                d={`M ${x} ${shellY + 86} Q ${x + 18} ${shellY + 105} ${x} ${shellY + 124}`}
                stroke="#67e8f9"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                opacity="0.95"
              />
            )
          })}

          {/* center title */}
          <text
            x={shellX + shellW / 2}
            y={shellY + 72}
            fill="#e2e8f0"
            fontSize="20"
            fontWeight="900"
            textAnchor="middle"
            letterSpacing="1.2"
          >
            CHILLER HEAT EXCHANGER
          </text>

          {/* compressor dots bottom left */}
          <text
            x="120"
            y="135"
            fill="#94a3b8"
            fontSize="14"
            fontWeight="800"
            textAnchor="middle"
            letterSpacing="1"
          >
            COMP
          </text>

          {compressors.slice(0, 6).map((comp, index) => {
            const col = index % 3
            const row = Math.floor(index / 3)
            const cx = 75 + col * 38
            const cy = 162 + row * 40

            return (
              <g key={comp.key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="14"
                  fill={comp.on ? '#22c55e' : '#475569'}
                  stroke={comp.on ? '#86efac' : '#64748b'}
                  strokeWidth="2.2"
                />
              </g>
            )
          })}

          {/* left side labels */}
          <text x="18" y="78" fill="#7dd3fc" fontSize="14" fontWeight="900">
            CHW IN
          </text>
          <text x="18" y="112" fill={tempColor(enteringWater, 'blue')} fontSize="22" fontWeight="900">
            {formatTemp(enteringWater)}
          </text>

          <text x="18" y="198" fill="#fda4af" fontSize="14" fontWeight="900">
            COND OUT
          </text>
          <text x="18" y="232" fill={tempColor(condLeaving, 'red')} fontSize="22" fontWeight="900">
            {formatTemp(condLeaving)}
          </text>

          {/* right side labels */}
          <text x={width - 18} y="78" fill="#7dd3fc" fontSize="14" fontWeight="900" textAnchor="end">
            CHW OUT
          </text>
          <text
            x={width - 18}
            y="112"
            fill={tempColor(leavingWater, 'blue')}
            fontSize="22"
            fontWeight="900"
            textAnchor="end"
          >
            {formatTemp(leavingWater)}
          </text>

          <text x={width - 18} y="198" fill="#fda4af" fontSize="14" fontWeight="900" textAnchor="end">
            COND IN
          </text>
          <text
            x={width - 18}
            y="232"
            fill={tempColor(condEntering, 'red')}
            fontSize="22"
            fontWeight="900"
            textAnchor="end"
          >
            {formatTemp(condEntering)}
          </text>

          {/* pipe connection points */}
          <circle cx={shellX - 4} cy="95" r="8" fill="#7dd3fc" opacity="0.95" />
          <circle cx={shellX + shellW + 4} cy="95" r="8" fill="#7dd3fc" opacity="0.95" />
          <circle cx={shellX - 4} cy="215" r="8" fill="#fda4af" opacity="0.95" />
          <circle cx={shellX + shellW + 4} cy="215" r="8" fill="#fda4af" opacity="0.95" />

          {/* small captions */}
          <text
            x={shellX + 34}
            y={shellY + shellH - 22}
            fill="rgba(148,163,184,0.85)"
            fontSize="12"
            fontWeight="700"
          >
            chilled water circuit
          </text>

          <text
            x={shellX + shellW - 34}
            y={shellY + shellH - 22}
            fill="rgba(148,163,184,0.85)"
            fontSize="12"
            fontWeight="700"
            textAnchor="end"
          >
            condenser water circuit
          </text>

          {/* glossy highlight */}
          <rect
            x={shellX + 12}
            y={shellY + 10}
            width={shellW - 24}
            height="42"
            rx="20"
            ry="20"
            fill="url(#glassGrad)"
            opacity="0.45"
          />
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
          <div style={{ marginTop: 4, color: tempColor(enteringWater, 'blue'), fontWeight: 900 }}>
            {formatTemp(enteringWater)}
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
          <div style={{ marginTop: 4, color: tempColor(leavingWater, 'blue'), fontWeight: 900 }}>
            {formatTemp(leavingWater)}
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
          <div style={{ marginTop: 4, color: tempColor(condEntering, 'red'), fontWeight: 900 }}>
            {formatTemp(condEntering)}
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
          <div style={{ marginTop: 4, color: tempColor(condLeaving, 'red'), fontWeight: 900 }}>
            {formatTemp(condLeaving)}
          </div>
        </div>
      </div>
    </button>
  )
}
