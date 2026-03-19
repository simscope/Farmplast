import React, { useMemo } from 'react'
import { getAssetStatus } from '../../utils/monitoringHelpers'

function toText(v) {
  return String(v || '').toUpperCase().trim()
}

function parseNumericValue(point) {
  const candidates = [
    point?.value_number,
    point?.value,
    point?.current_value,
    point?.reading,
    point?.raw_value,
    point?.display_value,
    point?.value_text,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && !Number.isNaN(candidate)) return candidate
    if (typeof candidate === 'string') {
      const cleaned = candidate.replace(/[^\d.-]/g, '')
      const parsed = Number(cleaned)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  return null
}

function buildSearchText(point) {
  return [
    point?.point_code,
    point?.point_name,
    point?.name,
    point?.label,
    point?.description,
    point?.display_name,
  ]
    .map((x) => toText(x))
    .join(' | ')
}

function findPointByAliases(points, aliases) {
  const normalizedAliases = aliases.map((a) => toText(a))
  return points.find((point) => {
    const text = buildSearchText(point)
    return normalizedAliases.some((alias) => text.includes(alias))
  })
}

function getTemperature(points, aliases, fallback = null) {
  const point = findPointByAliases(points, aliases)
  const parsed = parseNumericValue(point)
  return parsed ?? fallback
}

function getBoolean(points, aliases) {
  const point = findPointByAliases(points, aliases)
  const raw = point?.value_boolean

  if (typeof raw === 'boolean') return raw

  const parsed = parseNumericValue(point)
  if (parsed === 1) return true
  if (parsed === 0) return false

  return false
}

// ❗ УБРАЛИ старую getStatus

function isSixCompressorAsset(assetCode) {
  const code = String(assetCode || '').toUpperCase()
  return code === 'CH-NJ-02' || code === 'CH-NJ-03'
}

function getCompressorLayout(assetCode) {
  if (isSixCompressorAsset(assetCode)) {
    return ['1A', '1B', '1C', '2A', '2B', '2C']
  }

  return ['A', 'B']
}

function getCompressors(points, assetCode) {
  const layout = getCompressorLayout(assetCode)

  return layout.map((key) => ({
    key,
    on: getBoolean(points, [`COMP ${key}`, `COMPRESSOR ${key}`]),
  }))
}

function formatTemp(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--'
  return `${value.toFixed(1)}°F`
}

export default function ChillerIllustration({
  asset,
  selected = false,
  onSelect,
  isMobile = false,
}) {
  const points = Array.isArray(asset?.points) ? asset.points : []
  const assetCode = String(asset?.asset_code || '').toUpperCase()

  // ✅ ВОТ ГЛАВНОЕ
  const { online, alarm } = useMemo(() => getAssetStatus(asset), [asset])

  const compressors = useMemo(() => getCompressors(points, assetCode), [points, assetCode])

  const chwIn = getTemperature(points, ['CHW IN'])
  const chwOut = getTemperature(points, ['CHW OUT'])
  const condIn = getTemperature(points, ['COND IN'])
  const condOut = getTemperature(points, ['COND OUT'])

  return (
    <div
      onClick={onSelect}
      style={{
        border: '1px solid rgba(148,163,184,0.2)',
        borderRadius: 20,
        padding: 16,
        background: '#020617',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#67e8f9', fontSize: 12 }}>CHILLER</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {asset?.asset_name || asset?.asset_code}
          </div>
        </div>

        <div
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            fontWeight: 800,
            background: online ? '#022c22' : '#3f1d1d',
            color: online ? '#4ade80' : '#f87171',
          }}
        >
          {online ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        CHW IN: {formatTemp(chwIn)} | CHW OUT: {formatTemp(chwOut)}
      </div>
      <div>
        COND IN: {formatTemp(condIn)} | COND OUT: {formatTemp(condOut)}
      </div>

      <div style={{ marginTop: 10 }}>
        {compressors.map((c) => (
          <span
            key={c.key}
            style={{
              marginRight: 8,
              color: c.on ? '#22c55e' : '#475569',
            }}
          >
            {c.key}
          </span>
        ))}
      </div>

      {alarm && (
        <div style={{ marginTop: 10, color: '#f87171', fontWeight: 800 }}>
          ALARM
        </div>
      )}
    </div>
  )
}
