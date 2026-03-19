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

function isRealNumberValue(point) {
  if (point?.data_type !== 'number') return false
  if (point.value_number === null || point.value_number === undefined) return false
  if (Number.isNaN(Number(point.value_number))) return false

  const code = String(point.point_code || '').toUpperCase()
  const group = String(point.point_group || '').toUpperCase()
  const unit = String(point.unit || '').toUpperCase()
  const value = Number(point.value_number)

  if (code.includes('LEVEL') || group.includes('LEVEL') || unit === '%') {
    return value > 0
  }

  if (
    code.includes('TEMP') ||
    code.includes('CHW') ||
    code.includes('COND') ||
    code.includes('INLET') ||
    code.includes('OUTLET') ||
    code.includes('SUCTION') ||
    code.includes('DISCHARGE') ||
    code.includes('PRESSURE') ||
    unit === 'F' ||
    unit === 'PSI'
  ) {
    return value > 0
  }

  return value !== 0
}

function isRealBooleanValue(point) {
  if (point?.data_type !== 'boolean') return false
  return point.value_boolean === true
}

function isRealTextValue(point) {
  if (!point || point.data_type === 'number' || point.data_type === 'boolean') return false
  return String(point.value_text || '').trim() !== ''
}

export function hasRealTelemetry(points = []) {
  return points.some((point) => {
    return (
      isRealNumberValue(point) ||
      isRealBooleanValue(point) ||
      isRealTextValue(point)
    )
  })
}

export function hasAlarm(points = []) {
  return points.some((point) => {
    const code = String(point?.point_code || '').toUpperCase()
    const name = String(point?.point_name || '').toUpperCase()
    const group = String(point?.point_group || '').toUpperCase()

    const looksLikeAlarm =
      code.includes('ALARM') ||
      name.includes('ALARM') ||
      group.includes('ALARM') ||
      code.includes('FAULT') ||
      name.includes('FAULT')

    if (!looksLikeAlarm) return false

    if (point.data_type === 'boolean') {
      return point.value_boolean === true
    }

    if (point.data_type === 'number') {
      return point.value_number !== null && Number(point.value_number) > 0
    }

    return String(point.value_text || '').trim() !== ''
  })
}

export function getAssetStatus(points = []) {
  const latest = getLatestTime(points)

  if (!latest) {
    return {
      online: false,
      alarm: false,
      label: 'OFFLINE',
      lastSeenAt: null,
      secondsAgo: null,
      hasRealData: false,
    }
  }

  const secondsAgo = Math.floor((Date.now() - latest.getTime()) / 1000)
  const isFresh = secondsAgo <= ONLINE_THRESHOLD_SEC
  const realData = hasRealTelemetry(points)
  const alarm = hasAlarm(points)
  const online = isFresh && realData

  return {
    online,
    alarm,
    label: online ? 'ONLINE' : 'OFFLINE',
    lastSeenAt: latest.toISOString(),
    secondsAgo,
    hasRealData: realData,
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
