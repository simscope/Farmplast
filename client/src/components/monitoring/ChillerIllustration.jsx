import React from 'react'
import StatusPill from './StatusPill'
import { formatValue, getAssetStatus, statCardStyle } from '../../utils/monitoringHelpers'

export default function ChillerIllustration({ asset, selected, onSelect, isMobile }) {
  const status = getAssetStatus(asset.points)
  const temperatures = asset.points.filter((p) => p.point_group === 'temperatures')
  const compressors = asset.points.filter(
    (p) => p.point_group === 'compressors' || String(p.point_code || '').includes('COMP')
  )

  const chwIn = temperatures.find((p) => String(p.point_code || '').includes('CHW_IN'))
  const chwOut = temperatures.find((p) => String(p.point_code || '').includes('CHW_OUT'))
  const condIn = temperatures.find((p) => String(p.point_code || '').includes('COND_WATER_IN'))
  const condOut = temperatures.find((p) => String(p.point_code || '').includes('COND_WATER_OUT'))
  const activeComps = compressors.filter((p) => p.value_boolean === true).length
  const allOnline = status.online

  return (
    <button
      onClick={onSelect}
      style={{
        ...statCardStyle(isMobile),
        width: '100%',
        padding: isMobile ? 14 : 20,
        textAlign: 'left',
        cursor: 'pointer',
        border: selected ? '1px solid rgba(34,211,238,0.34)' : '1px solid rgba(148, 163, 184, 0.14)',
        boxShadow: selected
          ? '0 16px 40px rgba(14,165,233,0.16)'
          : '0 10px 30px rgba(0,0,0,0.24)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{asset.asset_code}</div>
          <div
            style={{
              marginTop: 4,
              fontSize: isMobile ? 20 : 24,
              fontWeight: 900,
              wordBreak: 'break-word',
            }}
          >
            {asset.asset_name}
          </div>
        </div>
        <StatusPill online={allOnline} />
      </div>

      <div
        style={{
          borderRadius: isMobile ? 18 : 22,
          overflow: 'hidden',
          border: '1px solid rgba(148,163,184,0.12)',
          background:
            'linear-gradient(180deg, rgba(5,10,20,0.88) 0%, rgba(15,23,42,0.92) 100%)',
          padding: isMobile ? 8 : 14,
        }}
      >
        <svg viewBox="0 0 720 260" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id={`chillerBody-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id={`waterPipe-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            <linearGradient id={`hotPipe-${asset.asset_code}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>

            <filter id={`softGlow-${asset.asset_code}`}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="110" y="40" rx="24" ry="24" width="340" height="160" fill={`url(#chillerBody-${asset.asset_code})`} stroke="rgba(148,163,184,0.24)" />
          <rect x="130" y="60" rx="18" ry="18" width="300" height="120" fill="#111827" stroke="rgba(148,163,184,0.18)" />

          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={190 + i * 90}
              cy={120}
              r="32"
              fill="#020617"
              stroke={allOnline ? '#22d3ee' : '#475569'}
              strokeWidth="3"
            />
          ))}

          {[0, 1, 2].map((i) => (
            <g key={`fan-${i}`} transform={`translate(${190 + i * 90}, 120)`}>
              <circle cx="0" cy="0" r="6" fill={allOnline ? '#67e8f9' : '#64748b'} />
              <path d="M0 -22 C8 -8 10 -2 2 4 C-4 2 -8 -4 0 -22Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite" />
                ) : null}
              </path>
              <path d="M22 0 C8 8 2 10 -4 2 C-2 -4 4 -8 22 0Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite" />
                ) : null}
              </path>
              <path d="M0 22 C-8 8 -10 2 -2 -4 C4 -2 8 4 0 22Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite" />
                ) : null}
              </path>
              <path d="M-22 0 C-8 -8 -2 -10 4 -2 C2 4 -4 8 -22 0Z" fill={allOnline ? '#22d3ee' : '#475569'}>
                {allOnline ? (
                  <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="2s" repeatCount="indefinite" />
                ) : null}
              </path>
            </g>
          ))}

          <rect x="470" y="60" rx="18" ry="18" width="120" height="120" fill="#0b1120" stroke="rgba(148,163,184,0.18)" />
          <rect x="485" y="78" rx="10" ry="10" width="90" height="22" fill={activeComps > 0 ? '#052e2b' : '#3f0d18'} stroke={activeComps > 0 ? '#22c55e' : '#ef4444'} />
          <text x="530" y="94" textAnchor="middle" fontSize="11" fill="#e2e8f0" fontWeight="700">
            COMPRESSORS
          </text>
          <text x="530" y="135" textAnchor="middle" fontSize="32" fill="#f8fafc" fontWeight="900">
            {activeComps}
          </text>
          <text x="530" y="157" textAnchor="middle" fontSize="12" fill="#94a3b8" fontWeight="700">
            ACTIVE
          </text>

          <line x1="88" y1="86" x2="650" y2="86" stroke={`url(#waterPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" opacity="0.9" />
          <line x1="88" y1="156" x2="650" y2="156" stroke={`url(#hotPipe-${asset.asset_code})`} strokeWidth="10" strokeLinecap="round" opacity="0.9" />

          <g transform="translate(355,156)">
            <rect x="-38" y="-20" width="76" height="40" rx="10" fill="#1e293b" stroke="#fb7185" strokeWidth="2" />
            <path d="M-24 -10 L-12 10" stroke="#fda4af" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M-8 -10 L4 10" stroke="#fda4af" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M8 -10 L20 10" stroke="#fda4af" strokeWidth="2.5" strokeLinecap="round" />
            <text x="0" y="-28" textAnchor="middle" fontSize="11" fill="#fecdd3" fontWeight="700">
              COND
            </text>
          </g>

          <circle cx="88" cy="86" r="9" fill="#38bdf8" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="88" cy="156" r="9" fill="#fb7185" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="650" cy="86" r="9" fill="#38bdf8" filter={`url(#softGlow-${asset.asset_code})`} />
          <circle cx="650" cy="156" r="9" fill="#fb7185" filter={`url(#softGlow-${asset.asset_code})`} />

          {allOnline ? (
            <>
              <circle cx="88" cy="86" r="5" fill="#bae6fd">
                <animate attributeName="cx" values="88;110;240;420;590;650" dur="3.2s" repeatCount="indefinite" />
              </circle>

              <circle cx="88" cy="156" r="5" fill="#fecdd3">
                <animate attributeName="cx" values="88;110;240;420;590;650" dur="3.8s" repeatCount="indefinite" />
              </circle>
            </>
          ) : null}

          <text x="88" y="68" textAnchor="middle" fontSize="12" fill="#bae6fd" fontWeight="700">
            {formatValue(chwIn)}
          </text>
          <text x="88" y="176" textAnchor="middle" fontSize="12" fill="#fecdd3" fontWeight="700">
            {formatValue(condIn)}
          </text>
          <text x="650" y="68" textAnchor="middle" fontSize="12" fill="#bae6fd" fontWeight="700">
            {formatValue(chwOut)}
          </text>
          <text x="650" y="176" textAnchor="middle" fontSize="12" fill="#fecdd3" fontWeight="700">
            {formatValue(condOut)}
          </text>
        </svg>
      </div>
    </button>
  )
}
