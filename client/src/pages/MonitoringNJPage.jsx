import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Wind } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ChillerIllustration from '../components/monitoring/ChillerIllustration'
import BarrelIllustration from '../components/monitoring/BarrelIllustration'
import {
  POLL_INTERVAL_MS,
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
  const [error, setError] = useState('')
  const [selectedAssetCode, setSelectedAssetCode] = useState('CH-NJ-01')

  const { isMobile, isTablet, isDesktop } = useViewport()

  async function fetchData({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true)
      }

      const { data, error: fetchError } = await supabase
        .from('v_asset_points_latest')
        .select('*')
        .order('asset_code', { ascending: true })
        .order('display_order', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      const normalized = Array.isArray(data) ? data.map(normalizeRow) : []
      setRows(normalized)

      if (!normalized.length) {
        setError('No live telemetry rows returned from v_asset_points_latest.')
      } else {
        setError('')
      }
    } catch (err) {
      setRows([])
      setError(err?.message || 'Failed to load live telemetry.')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchData()

    const timer = setInterval(() => {
      fetchData({ silent: true })
    }, POLL_INTERVAL_MS)

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
          fetchData({ silent: true })
        }
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  const assets = useMemo(() => groupAssets(rows), [rows])

  const njAssets = useMemo(() => {
    return assets.filter((a) => {
      const code = String(a.asset_code || '').toUpperCase()
      return code.includes('-NJ-') || code === 'CH2' || code === 'CH3'
    })
  }, [assets])

  const chillers = useMemo(() => {
    return njAssets.filter((a) => String(a.asset_type || '').toLowerCase() === 'chiller')
  }, [njAssets])

  const barrels = useMemo(() => {
    return njAssets
      .filter((a) => String(a.asset_type || '').toLowerCase() === 'barrel')
      .sort(barrelSort)
  }, [njAssets])

  const selectedAsset = useMemo(() => {
    if (!chillers.length) return null
    return chillers.find((a) => a.asset_code === selectedAssetCode) || chillers[0]
  }, [chillers, selectedAssetCode])

  useEffect(() => {
    if (!selectedAsset && chillers[0]) {
      setSelectedAssetCode(chillers[0].asset_code)
    }
  }, [selectedAsset, chillers])

  const summary = useMemo(() => {
    const online = njAssets.filter((a) => getAssetStatus(a.points).online).length
    const offline = njAssets.length - online

    const compressorsOn = njAssets
      .flatMap((a) => a.points)
      .filter((p) => {
        const isCompressorPoint =
          p.point_group === 'compressors' || String(p.point_code || '').toUpperCase().includes('COMP')
        return isCompressorPoint && p.value_boolean === true
      }).length

    const barrelLevelPoint = njAssets
      .flatMap((a) => a.points)
      .find((p) => String(p.point_code || '').toUpperCase() === 'LEVEL_PERCENT')

    return {
      total: njAssets.length,
      online,
      offline,
      compressorsOn,
      barrelLevel:
        barrelLevelPoint?.value_number === null || barrelLevelPoint?.value_number === undefined
          ? null
          : Number(barrelLevelPoint.value_number),
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
                {summary.barrelLevel === null || Number.isNaN(summary.barrelLevel)
                  ? '—'
                  : `${summary.barrelLevel.toFixed(0)}%`}
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
        ) : !njAssets.length ? (
          <div style={statCardStyle(isMobile)}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>No live NJ telemetry</div>
            <div style={{ color: '#94a3b8', fontSize: 14 }}>
              The page is running, but no New Jersey assets were returned from the live source.
            </div>
          </div>
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
              {chillers.length ? (
                chillers.map((asset) => (
                  <ChillerIllustration
                    key={asset.asset_code}
                    asset={asset}
                    selected={selectedAsset?.asset_code === asset.asset_code}
                    onSelect={() => setSelectedAssetCode(asset.asset_code)}
                    isMobile={isMobile}
                  />
                ))
              ) : (
                <div style={statCardStyle(isMobile)}>No live chiller telemetry yet.</div>
              )}
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
                  <div>• Demo mode is fully removed</div>
                  <div>• Online status is based only on fresh telemetry timestamps</div>
                  <div>• If data stops updating for more than 15 seconds, the asset becomes OFFLINE</div>
                  <div>• If Supabase returns no rows or fails, the page shows a real error instead of fake values</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
