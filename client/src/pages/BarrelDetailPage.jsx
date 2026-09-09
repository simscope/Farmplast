import React, { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import useMonitoringPolling from '../hooks/useMonitoringPolling'
import { BARREL_SOURCE_CODES, getBarrelStatus } from '../utils/barrelMonitoring'
import { groupAssets, formatValue, statCardStyle, pageButtonStyle } from '../utils/monitoringHelpers'

const DETAIL_COLUMNS = 'asset_code,asset_name,asset_type,point_code,point_name,data_type,value_number,value_boolean,value_text,unit,updated_at,display_order'

export default function BarrelDetailPage({ barrelNumber }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (signal) => {
    try {
      const { data, error: fetchError } = await supabase.from('v_asset_points_latest')
        .select(DETAIL_COLUMNS).eq('asset_code', BARREL_SOURCE_CODES[barrelNumber])
        .order('display_order').abortSignal(signal)
      if (signal.aborted) return
      if (fetchError) throw fetchError
      setRows(data || [])
      setError('')
    } catch (err) {
      if (signal.aborted) return
      setRows([])
      setError(err?.message || 'Failed to load barrel diagnostics.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [barrelNumber])
  const refresh = useMonitoringPolling(load, 5000)
  const asset = groupAssets(rows)[0]
  const status = getBarrelStatus(asset)
  return <main style={{ minHeight: '100vh', padding: 20, color: '#f8fafc', background: 'radial-gradient(circle at top, #0f766e, #020617 60%)' }}>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Link to="/monitoring/nj" style={{ color: '#67e8f9' }}>← Back to NJ monitoring</Link>
      <h1>Material Barrel {barrelNumber}</h1>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
        <strong style={{ color: status.online ? '#4ade80' : '#f87171' }}>{status.online ? 'ONLINE' : 'OFFLINE'}</strong>
        <button onClick={() => refresh(false)} style={pageButtonStyle()}>Refresh</button>
      </div>
      <p>Last update: {status.lastSeenAt ? new Date(status.lastSeenAt).toLocaleString() : '—'}</p>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      {loading ? <p>Loading barrel diagnostics…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {(asset?.points || []).filter(point => !point.point_code.endsWith('_ONLINE')).map(point => <div key={point.point_code} style={statCardStyle()}>
          <div style={{ color: '#67e8f9', fontWeight: 800 }}>{point.point_name}</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 10 }}>{formatValue(point)}</div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>Updated: {point.updated_at ? new Date(point.updated_at).toLocaleString() : 'No data'}</div>
        </div>)}
        {!asset && <p>No barrel telemetry available.</p>}
      </div>}
    </div>
  </main>
}
