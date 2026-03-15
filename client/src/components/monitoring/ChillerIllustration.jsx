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

  return {
    online,
    alarm,
  }
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
      map.set(key, {
        key,
        on: false,
      })
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

  const width = isMobile ? 360 : 760
  const height = isMobile ? 250 : 300

  const frameStroke = selected
    ? 'rgba(34, 211, 238, 0.95)'
    : 'rgba(148, 163, 184, 0.25)'

  const outerGlow = selected
    ? '0 0 0 1px rgba(34, 211, 238, 0.3), 0 18px 40px rgba(8, 47, 73, 0.55)'
    : '0 16px 36px rgba(2, 6, 23, 0.45)'

  const cardBg = alarm
    ? 'linear-gradient(180deg, rgba(69,10,10,0.78) 0%, rgba(24,24,27,0.92) 100%)'
    : 'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(3,7,18,0.96) 100%)'

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
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16233b" />
              <stop offset="100%" stopColor="#0b1324" />
            </linearGradient>

            <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* left pipes */}
          <path
            d={isMobile ? 'M24 72 H120' : 'M24 86 H160'}
            stroke="#38bdf8"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowBlue)"
          />
          <path
            d={isMobile ? 'M24 176 H120' : 'M24 218 H160'}
            stroke="#fb7185"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            filter="url(#softGlowRed)"
          />

          {/* flow dots */}
          {online && (
            <>
              <circle r="6" fill="#7dd3fc" filter="url(#softGlowBlue)">
                <animateMotion
                  dur="2.4s"
                  repeatCount="indefinite"
                  path={isMobile ? 'M24 72 H120' : 'M24 86 H160'}
                />
              </circle>
              <circle r="6" fill="#fda4af" filter="url(#softGlowRed)">
                <animateMotion
                  dur="2.4s"
                  repeatCount="indefinite"
                  path={isMobile ? 'M120 176 H24' : 'M160 218 H24'}
                />
              </circle>
            </>
          )}

          {/* main body like before */}
          <rect
            x={isMobile ? 118 : 156}
            y={isMobile ? 34 : 34}
            rx="28"
            ry="28"
            width={isMobile ? 214 : 510}
            height={isMobile ? 168 : 220}
            fill="url(#bodyGrad)"
            stroke="rgba(148,163,184,0.22)"
            strokeWidth="2"
          />

          <rect
            x={isMobile ? 138 : 182}
            y={isMobile ? 54 : 56}
            rx="20"
            ry="20"
            width={isMobile ? 174 : 458}
            height={isMobile ? 128 : 176}
            fill="url(#panelGrad)"
            stroke="rgba(148,163,184,0.12)"
            strokeWidth="1.5"
          />

          {/* compressors on left */}
          <text
            x={isMobile ? 74 : 84}
            y={isMobile ? 108 : 124}
            fill="#94a3b8"
            fontSize={isMobile ? 12 : 14}
            fontWeight="800"
            textAnchor="middle"
            letterSpacing="1"
          >
            COMP
          </text>

          {compressors.slice(0, isMobile ? 3 : 6).map((comp, index) => {
            const col = index % (isMobile ? 3 : 3)
            const row = Math.floor(index / 3)
            const baseX = isMobile ? 48 : 48
            const baseY = isMobile ? 126 : 148
            const gapX = isMobile ? 28 : 34
            const gapY = isMobile ? 34 : 40
            const cx = baseX + col * gapX
            const cy = baseY + row * gapY

            return (
              <g key={comp.key}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isMobile ? 10 : 12}
                  fill={comp.on ? '#22c55e' : '#475569'}
                  stroke={comp.on ? '#86efac' : '#64748b'}
                  strokeWidth="2"
                />
              </g>
            )
          })}

          {/* side labels */}
          <text
            x={isMobile ? 14 : 12}
            y={isMobile ? 76 : 90}
            fill="#7dd3fc"
            fontSize={isMobile ? 12 : 14}
            fontWeight="900"
            textAnchor="start"
          >
            CHW
          </text>

          <text
            x={isMobile ? 14 : 12}
            y={isMobile ? 180 : 222}
            fill="#fda4af"
            fontSize={isMobile ? 12 : 14}
            fontWeight="900"
            textAnchor="start"
          >
            COND
          </text>
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
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ECHW</div>
          <div style={{ marginTop: 4, color: '#e2e8f0', fontWeight: 900 }}>
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
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>LCHW</div>
          <div style={{ marginTop: 4, color: '#7dd3fc', fontWeight: 900 }}>
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
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>ECW</div>
          <div style={{ marginTop: 4, color: '#fbcfe8', fontWeight: 900 }}>
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
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>LCW</div>
          <div style={{ marginTop: 4, color: '#fda4af', fontWeight: 900 }}>
            {formatTemp(condLeaving)}
          </div>
        </div>
      </div>
    </button>
  )
}
