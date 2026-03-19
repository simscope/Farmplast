export const POLL_INTERVAL_MS = 5000
export const ONLINE_THRESHOLD_SEC = 15

export function normalizeRow(row) {
  return {
    asset_id: row?.asset_id ?? null,
    asset_code: row?.asset_code ?? '',
    asset_name: row?.asset_name ?? '',
    asset_type: row?.asset_type ?? '',
    point_id: row?.point_id ?? null,
    point_code: row?.point_code ?? '',
    point_name: row?.point_name ?? '',
    point_group: row?.point_group ?? '',
    data_type: row?.data_type ?? '',
    value_number:
      row?.value_number === null || row?.value_number === undefined || row?.value_number === ''
        ? null
        : Number(row.value_number),
    value_boolean:
      row?.value_boolean === null || row?.value_boolean === undefined
        ? null
        : row.value_boolean,
    value_text: row?.value_text ?? '',
    unit: row?.unit || '',
    updated_at: row?.updated_at || row?.created_at || null,
    display_order: row?.display_order ?? 0,
  }
}

export function formatValue(point) {
  if (!point) return '—'

  if (point.data_type === 'boolean') {
    if (point.value_boolean === null || point.value_boolean === undefined) return '—'
    return point.value_boolean ? 'ON' : 'OFF'
  }

  if (point.data_type === 'number') {
    if (point.value_number === null || point.value_number === undefined) return '—'
    const num = Number(point.value_number)
    if (Number.isNaN(num)) return '—'
    if (point.unit === '%') return `${num.toFixed(1)}%`
    if (point.unit === 'mA') return `${num.toFixed(2)} mA`
    if (point.unit === 'F') return `${num.toFixed(1)}°F`
    return `${num.toFixed(1)}${point.unit ? ` ${point.unit}` : ''}`
  }

  return point.value_text || '—'
}

export function getLatestTime(points = []) {
  let latest = null

  for (const p of points) {
    if (!p?.updated_at) continue

    const d = new Date(p.updated_at)
    if (Number.isNaN(d.getTime())) continue

    if (!latest || d.getTime() > latest.getTime()) {
      latest = d
    }
  }

  return latest
}

export function getAssetStatus(points = []) {
  const latest = getLatestTime(points)

  if (!latest) {
    return {
      online: false,
      label: 'OFFLINE',
      lastSeenAt: null,
      secondsAgo: null,
    }
  }

  const secondsAgo = Math.floor((Date.now() - latest.getTime()) / 1000)
  const online = secondsAgo <= ONLINE_THRESHOLD_SEC

  return {
    online,
    label: online ? 'ONLINE' : 'OFFLINE',
    lastSeenAt: latest.toISOString(),
    secondsAgo,
  }
}

export function groupAssets(rows = []) {
  const grouped = {}

  for (const raw of rows) {
    const row = normalizeRow(raw)
    const key = row.asset_code || row.asset_id || `unknown-${row.point_id || Math.random()}`

    if (!grouped[key]) {
      grouped[key] = {
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        asset_type: row.asset_type,
        points: [],
      }
    }

    grouped[key].points.push(row)
  }

  return Object.values(grouped)
    .map((asset) => ({
      ...asset,
      points: [...asset.points].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
      ),
    }))
    .sort((a, b) =>
      String(a.asset_code || '').localeCompare(String(b.asset_code || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    )
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
