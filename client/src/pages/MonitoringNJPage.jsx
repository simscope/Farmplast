import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Wind } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ChillerIllustration from '../components/monitoring/ChillerIllustration'
import BarrelIllustration from '../components/monitoring/BarrelIllustration'
import {
  POLL_INTERVAL_MS,
  mockRows,
  normalizeRow,
  groupAssets,
  getAssetStatus,
  statCardStyle,
  pageButtonStyle,
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

function barrelSort(a, b) {
  const codeA = String(a?.asset_code || '')
  const codeB = String(b?.asset_code || '')
  return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' })
}

export default function MonitoringNJPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedAssetCode, setSelectedAssetCode] = useState('CH-NJ-01')
  const [useMockData, setUseMockData] = useState(false)

  const { isMobile, isTablet, isDesktop } = useViewport()

  async function fetchData() {
    try {
      const { data, error } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (error) throw error

      if (!data || !data.length) {
        setRows(mockRows)
        setUseMockData(true)
        setError('Supabase returned no rows. Showing demo visualization.')
      } else {
        setRows(data.map(normalizeRow))
        setUseMockData(false)
        setError(null)
      }
    } catch (err) {
      setRows(mockRows)
      setUseMockData(true)
      setError(err?.message || 'Live telemetry unavailable. Showing demo visualization.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    const timer = setInterval(fetchData, POLL_INTERVAL_MS)

    const channel = supabase
      .channel('monitoring-telemetry-latest')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_latest',
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  const assets = useMemo(() => groupAssets(rows), [rows])

  const njAssets = useMemo(
    () =>
      assets.filter((a) => {
        const code = String(a.asset_code || '').toUpperCase()
        return code.includes('-NJ-') || code === 'CH2' || code === 'CH3'
      }),
    [assets]
  )

  const chillers = useMemo(
    () => njAssets.filter((a) => String(a.asset_type || '').toLowerCase() === 'chiller'),
    [njAssets]
  )

  const barrels = useMemo(
    () =>
      njAssets
        .filter((a) => String(a.asset_type || '').toLowerCase() === 'barrel')
        .sort(barrelSort),
    [njAssets]
  )

  const selectedAsset = useMemo(
    () => chillers.find((a) => a.asset_code === selectedAssetCode) || chillers[0] || null,
    [chillers, selectedAssetCode]
  )

  const summary = useMemo(() => {
    const online = njAssets.filter((a) => getAssetStatus(a.points).online).length
    const offline = njAssets.length - online
    const compressorsOn = njAssets
      .flatMap((a) => a.points)
      .filter(
        (p) =>
          (p.point_group === 'compressors' || String(p.point_code || '').includes('COMP')) &&
          p.value_boolean === true
      ).length

    const barrelLevelPoint = njAssets
      .flatMap((a) => a.points)
      .find((p) => String(p.point_code || '') === 'LEVEL_PERCENT')

    return {
      total: njAssets.length,
      online,
      offline,
      compressorsOn,
      barrelLevel: Number(barrelLevelPoint?.value_number ?? 0),
    }
  }, [njAssets])

  const pagePadding = isMobile ? 12 : 16
  const mainGridColumns = isDesktop ? '1.3fr 0.9fr' : '1fr'
  const summaryColumns = isMobile
    ? 'repeat(2, minmax(0, 1fr))'
    : isTablet
      ? 'repeat(3, minmax(0, 1fr))'
      : 'repeat(5, minmax(120px, 1fr))'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #0f766e 0%, #031323 24%, #020617 58%, #01030a 100%)',
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

            <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
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
              width: isDesktop ? 'min(100%, 820px)' : '100%',
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
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 900 }}>BARREL</div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 24 : 30,
                  fontWeight: 900,
                  color: '#facc15',
                }}
              >
                {summary.barrelLevel.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {useMockData ? (
          <div
            style={{
              ...statCardStyle(isMobile),
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#fde68a',
              border: '1px solid rgba(245, 158, 11, 0.24)',
            }}
          >
            <AlertTriangle size={18} />
            {error || 'Live data is unavailable. Demo values are shown so the page still looks complete.'}
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
              {chillers.map((asset) => (
                <ChillerIllustration
                  key={asset.asset_code}
                  asset={asset}
                  selected={selectedAsset?.asset_code === asset.asset_code}
                  onSelect={() => setSelectedAssetCode(asset.asset_code)}
                  isMobile={isMobile}
                />
              ))}
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              {barrels[0] ? (
                <BarrelIllustration asset={barrels[0]} isMobile={isMobile} />
              ) : (
                <div style={statCardStyle(isMobile)}>No barrel 1 telemetry yet.</div>
              )}

              {barrels[1] ? (
                <BarrelIllustration asset={barrels[1]} isMobile={isMobile} />
              ) : (
                <div style={statCardStyle(isMobile)}>
                  <div
                    style={{
                      color: '#67e8f9',
                      fontSize: 13,
                      fontWeight: 900,
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    BARREL-NJ-02
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
                    Material Barrel 2
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 14 }}>
                    Second barrel is not in telemetry yet.
                  </div>
                </div>
              )}

              <div style={statCardStyle(isMobile)}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#cbd5e1',
                    fontWeight: 900,
                    marginBottom: 12,
                  }}
                >
                  <Wind size={16} />
                  System notes
                </div>

                <div style={{ display: 'grid', gap: 10, color: '#cbd5e1', fontSize: 14 }}>
                  <div>• Chillers show live process temperatures and compressor sections</div>
                  <div>• Right column is reserved for barrel monitoring only</div>
                  <div>• Add BARREL-NJ-02 in assets and points to replace the placeholder with live data</div>
                  <div>• Online status is based on latest telemetry timestamp freshness</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
