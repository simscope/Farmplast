export const POLL_INTERVAL_MS = 5000
export const ONLINE_THRESHOLD_SEC = 90

export const mockRows = [
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-1',
    point_code: 'CHW_IN',
    point_name: 'Chilled Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 52.4,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-2',
    point_code: 'CHW_OUT',
    point_name: 'Chilled Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 44.6,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-3',
    point_code: 'COND_WATER_IN',
    point_name: 'Condenser Water In',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 78.2,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 3,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-4',
    point_code: 'COND_WATER_OUT',
    point_name: 'Condenser Water Out',
    point_group: 'temperatures',
    data_type: 'number',
    value_number: 86.1,
    unit: 'F',
    updated_at: new Date().toISOString(),
    display_order: 4,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-5',
    point_code: 'COMP_A',
    point_name: 'Compressor A',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: true,
    updated_at: new Date().toISOString(),
    display_order: 5,
  },
  {
    asset_id: '1',
    asset_code: 'CH-NJ-01',
    asset_name: 'Chiller 01',
    asset_type: 'chiller',
    point_id: '1-6',
    point_code: 'COMP_B',
    point_name: 'Compressor B',
    point_group: 'compressors',
    data_type: 'boolean',
    value_boolean: false,
    updated_at: new Date().toISOString(),
    display_order: 6,
  },
  {
    asset_id: '4',
    asset_code: 'BARREL-NJ-01',
    asset_name: 'Material Barrel 1',
    asset_type: 'barrel',
    point_id: '4-1',
    point_code: 'LEVEL_PERCENT',
    point_name: 'Level Percent',
    point_group: 'level',
    data_type: 'number',
    value_number: 67.8,
    unit: '%',
    updated_at: new Date().toISOString(),
    display_order: 1,
  },
  {
    asset_id: '4',
    asset_code: 'BARREL-NJ-01',
    asset_name: 'Material Barrel 1',
    asset_type: 'barrel',
    point_id: '4-2',
    point_code: 'LEVEL_MA',
    point_name: 'Current Loop',
    point_group: 'level',
    data_type: 'number',
    value_number: 14.84,
    unit: 'mA',
    updated_at: new Date().toISOString(),
    display_order: 2,
  },
]

export function normalizeRow(row) {
  return {
    asset_id: row.asset_id,
    asset_code: row.asset_code,
    asset_name: row.asset_name,
    asset_type: row.asset_type,
    point_id: row.point_id,
    point_code: row.point_code,
    point_name: row.point_name,
    point_group: row.point_group,
    data_type: row.data_type,
    value_number:
      row.value_number === null || row.value_number === undefined
        ? null
        : Number(row.value_number),
    value_boolean:
      row.value_boolean === null || row.value_boolean === undefined
        ? null
        : row.value_boolean,
    value_text: row.value_text,
    unit: row.unit || '',
    updated_at: row.updated_at,
    display_order: row.display_order ?? 0,
  }
}

export function formatValue(point) {
  if (point?.data_type === 'boolean') return point.value_boolean ? 'ON' : 'OFF'

  if (point?.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
    if (Number.isNaN(num)) return '—'
    if (point.unit === '%') return `${num.toFixed(1)}%`
    if (point.unit === 'mA') return `${num.toFixed(2)} mA`
    if (point.unit === 'F') return `${num.toFixed(1)}°F`
    return `${num.toFixed(1)}${point.unit ? ` ${point.unit}` : ''}`
  }

  return point?.value_text || '—'
}

export function getLatestTime(points) {
  let latest = null
  for (const p of points) {
    if (!p?.updated_at) continue
    const d = new Date(p.updated_at)
    if (Number.isNaN(d.getTime())) continue
    if (!latest || d > latest) latest = d
  }
  return latest
}

export function getAssetStatus(points) {
  const latest = getLatestTime(points)
  if (!latest) return { online: false, label: 'OFFLINE' }

  const secondsAgo = Math.floor((Date.now() - latest.getTime()) / 1000)
  return {
    online: secondsAgo <= ONLINE_THRESHOLD_SEC,
    label: secondsAgo <= ONLINE_THRESHOLD_SEC ? 'ONLINE' : 'OFFLINE',
  }
}

export function groupAssets(rows) {
  const grouped = {}

  for (const row of rows) {
    if (!grouped[row.asset_code]) {
      grouped[row.asset_code] = {
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        asset_type: row.asset_type,
        points: [],
      }
    }
    grouped[row.asset_code].points.push(row)
  }

  return Object.values(grouped)
    .map((asset) => ({
      ...asset,
      points: [...asset.points].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    }))
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code))
}

export function statCardStyle(isMobile = false) {
  return {
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: isMobile ? 18 : 24,
    padding: isMobile ? 14 : 18,
    boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
    backdropFilter: 'blur(10px)',
  }
}

export function pageButtonStyle(active = true, isMobile = false) {
  return {
    border: '1px solid rgba(148,163,184,0.18)',
    background: active ? 'rgba(8,47,73,0.84)' : 'rgba(15,23,42,0.7)',
    color: '#e2e8f0',
    borderRadius: 16,
    padding: isMobile ? '12px 14px' : '10px 14px',
    cursor: 'pointer',
    fontWeight: 800,
    minHeight: isMobile ? 44 : 'auto',
  }
}
