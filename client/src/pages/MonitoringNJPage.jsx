import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import BarrelIllustration from '../components/monitoring/BarrelIllustration'
import useMonitoringPolling from '../hooks/useMonitoringPolling'
import { OVERVIEW_COLUMNS } from '../utils/monitoringColumns'
import { statCardStyle, pageButtonStyle } from '../utils/monitoringHelpers'

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

function StatusDot({ active, label, unsupported }) {
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
        justifyContent: 'center',
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
      {label}: {active == null ? (unsupported ? 'N/A' : 'UNKNOWN') : active ? 'ON' : 'OFF'}
    </div>
  )
}


const COMPRESSORS = ['1a', '1b', '1c', '2a', '2b', '2c']
const SLOTS = [
  ...[1, 2, 3].map(n => ({ asset_code: `CH-NJ-0${n}`, asset_name: `Chiller ${n}`, asset_type: 'chiller', route: `chiller-${n}` })),
  ...[1, 2].map(n => ({ asset_code: `BARREL-NJ-0${n}`, asset_name: `Material Barrel ${n}`, asset_type: 'barrel', route: `barrel-${n}` })),
]

function DashboardChillerCard({ asset, isMobile }) {
  return <Link to={`/monitoring/nj/${asset.route}`} style={{ color: 'inherit', textDecoration: 'none' }}>
    <div style={{ ...statCardStyle(isMobile), border: '1px solid rgba(56,189,248,0.22)', borderRadius: 28, background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900 }}>{asset.asset_code}</div>
          <h2 style={{ fontSize: isMobile ? 28 : 40, margin: '8px 0 18px' }}>{asset.asset_name}</h2></div>
        <Badge tone={asset.is_online ? 'green' : 'red'}>{asset.is_online ? 'ONLINE' : 'OFFLINE'}</Badge>
      </div>
      <div style={{ padding: 18, borderRadius: 24, border: '1px solid rgba(56,189,248,0.14)', background: 'radial-gradient(circle, rgba(59,130,246,0.12), rgba(2,6,23,0.72))' }}>
        <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 900, marginBottom: 16 }}>COMPRESSOR SECTIONS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {COMPRESSORS.map(code => <StatusDot key={code} label={code.toUpperCase()} unsupported={asset.asset_code === 'CH-NJ-01' && !['1a', '1b'].includes(code)} active={asset[`comp_${code}_enabled`]} />)}
        </div>
        {asset.asset_code === 'CH-NJ-01' && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>1A = Compressor 1 · 1B = Compressor 2</div>}
      </div>
    </div>
  </Link>
}

export default function MonitoringNJPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { isMobile, isTablet, isDesktop } = useViewport()
  const load = useCallback(async (signal) => {
    try {
      const { data, error: fetchError } = await supabase.from('v_nj_monitoring_overview')
        .select(OVERVIEW_COLUMNS).order('asset_code').abortSignal(signal)
      if (signal.aborted) return
      if (fetchError) throw fetchError
      if (data?.length !== 5) throw new Error('Expected five NJ monitoring assets.')
      setRows(data)
      setError('')
    } catch (err) {
      if (signal.aborted) return
      setRows([])
      setError(err?.message || 'Failed to load NJ monitoring status.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])
  useMonitoringPolling(load, 15000)
  const assets = SLOTS.map(slot => ({ ...slot, ...rows.find(row => row.asset_code === slot.asset_code) }))
  const chillers = assets.filter(asset => asset.asset_type === 'chiller')
  const barrelSlots = assets.filter(asset => asset.asset_type === 'barrel')
  const online = assets.filter(asset => asset.is_online).length
  const summary = {
    total: assets.length, online, offline: assets.length - online,
    compressorsOn: chillers.reduce((sum, asset) => sum + COMPRESSORS.filter(code => asset[`comp_${code}_enabled`] === true).length, 0),
    barrelLevels: barrelSlots.map(asset => asset.level_percent),
  }
  const pagePadding = isMobile ? 12 : 16
  const mainGridColumns = isDesktop ? '1.3fr 0.9fr' : '1fr'
  const summaryColumns = isMobile
    ? 'repeat(2, minmax(0, 1fr))'
    : isTablet
      ? 'repeat(3, minmax(0, 1fr))'
      : 'repeat(6, minmax(120px, 1fr))'


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
              width: isDesktop ? 'min(100%, 980px)' : '100%',
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
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>BARREL 1</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#facc15',
                }}
              >
                {!Number.isFinite(summary.barrelLevels[0])
                  ? '--'
                  : `${summary.barrelLevels[0].toFixed(0)}%`}
              </div>
            </div>

            <div style={statCardStyle(isMobile)}>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>BARREL 2</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#facc15',
                }}
              >
                {!Number.isFinite(summary.barrelLevels[1])
                  ? '--'
                  : `${summary.barrelLevels[1].toFixed(0)}%`}
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

              {chillers.map(asset => <DashboardChillerCard key={asset.asset_code} asset={asset} isMobile={isMobile} />)}
            </div>
            <div style={{ display: 'grid', gap: 18 }}>
              {barrelSlots.map(barrel => <Link key={barrel.asset_code} to={`/monitoring/nj/${barrel.route}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <BarrelIllustration asset={barrel} isMobile={isMobile} overview />
              </Link>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
