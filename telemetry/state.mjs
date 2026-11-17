import points from './points.json' with { type: 'json' }

export const ASSETS = [
  { asset_code: 'CH-NJ-01', asset_id: '4327afc7-a56b-4253-97c9-3de3632fb189', asset_name: 'Chiller 1', asset_type: 'chiller', device_code: 'ESP32-CH1', device_id: 'db7a7808-8ceb-407a-bfbf-c215e42ffb93', producer: 'chiller-1', ttl: 16000 },
  { asset_code: 'CH-NJ-02', asset_id: '7a271a50-2521-44ed-a2c1-2c3308ca45ba', asset_name: 'Chiller 2', asset_type: 'chiller', device_code: 'ESP32-CH2-PLC', producer: 'chiller-2', ttl: 45000 },
  { asset_code: 'CH-NJ-03', asset_id: 'a349bc94-410c-4c29-8055-553c6dfdf12f', asset_name: 'Chiller 3', asset_type: 'chiller', device_code: 'ESP32-CH3-PLC', producer: 'chiller-3', ttl: 45000 },
  { asset_code: 'BARREL-NJ-01', asset_id: '0014e66c-a0d1-4b92-8209-1d10b2bca942', asset_name: 'Material Barrel 1', asset_type: 'barrel', device_code: 'ESP32-BARREL1', device_id: '48a565bf-1583-45bc-9696-f0a41c6a7984', producer: 'barrels', ttl: 35000 },
  { asset_code: 'BARREL-NJ-02', asset_id: '3b035658-b8e0-493b-b868-33d0bea04ece', asset_name: 'Material Barrel 2', asset_type: 'barrel', device_code: 'ESP32-BARREL2', device_id: '33647842-9386-4d8d-8baa-985c6a195be5', producer: 'barrels', ttl: 35000 },
]
export const RAW_REGISTERS = [40023, 40024, 40025, 40051, 40052, 40056, 40057, 40061]
const BITS = ['SYSTEM_RUNNING', 'COMP_1A_ENABLED', 'COMP_1B_ENABLED', 'COMP_1C_ENABLED', 'COMP_2A_ENABLED', 'COMP_2B_ENABLED', 'COMP_2C_ENABLED']
const DERIVED = { CHILLER_ENTERING_F: [40024, 10], CHILLER_LEAVING_F: [40025, 10], FLOW_C1_GPM: [40051, 1], FLOW_C2_GPM: [40052, 1], EVAP_OUT_C1_F: [40056, 10], EVAP_OUT_C2_F: [40057, 10] }
export const VIEW_NAMES = ['v_asset_points_latest', 'v_nj_monitoring_overview', 'v_ch2_dashboard', 'v_ch3_dashboard', 'ch2_latest', 'ch3_latest']

function value(row, type) {
  const field = type === 'boolean' ? 'value_boolean' : 'value_number'
  const v = row?.[field]
  if (typeof v !== (type === 'boolean' ? 'boolean' : 'number') || (type !== 'boolean' && !Number.isFinite(v))) throw new Error('Invalid reading type')
  return { value_number: type === 'number' ? v : null, value_boolean: type === 'boolean' ? v : null, value_text: null }
}

// One fixed-size snapshot per asset. No samples are appended, restored or written.
export function createTelemetryState(now = Date.now) {
  const snapshots = new Map()
  const receipts = new Map()
  const fresh = (asset, sample) => sample && now() >= sample.received && now() - sample.received < asset.ttl
  function expire() {
    for (const asset of ASSETS) {
      if (!fresh(asset, snapshots.get(asset.asset_code))) snapshots.delete(asset.asset_code)
    }
  }
  function ingest(producer, body) {
    const assets = ASSETS.filter(a => a.producer === producer)
    if (!assets.length) throw new Error('Unknown producer')
    const batch = new Map()
    const put = (asset, metadata, reading) => {
      const vals = value(reading, metadata.data_type)
      if (metadata.point_code.endsWith('_LEVEL_PERCENT') && (vals.value_number < 0 || vals.value_number > 100)) throw new Error('Invalid level')
      if (!batch.has(asset.asset_code)) batch.set(asset.asset_code, new Map())
      const target = batch.get(asset.asset_code)
      if (target.has(metadata.point_code)) throw new Error('Duplicate reading')
      target.set(metadata.point_code, { ...metadata, ...vals, updated_at: new Date(now()).toISOString() })
    }
    if (producer === 'chiller-2' || producer === 'chiller-3') {
      const asset = assets[0]
      const payload = body?.payload
      if (payload?.device_code !== asset.device_code || !Array.isArray(payload.readings) || payload.readings.length > 32) throw new Error('Wrong device or batch')
      for (const row of payload.readings) {
        // CH3 intentionally keeps the deployed CH2_ wire prefix.
        const code = row.point_code
        const register = /^CH2_R(\d+)$/.exec(code || '')
        const bit = BITS.find(b => code === `CH2_${b}`)
        if (register && RAW_REGISTERS.includes(Number(register[1]))) {
          if (!Number.isInteger(row.value_number) || row.value_number < 0 || row.value_number > 65535) throw new Error('Invalid Modbus register')
          put(asset, { point_code: code, point_name: code, data_type: 'number', raw_register: Number(register[1]), raw_value: row.value_number }, row)
        } else if (bit) put(asset, { point_code: code, point_name: code, data_type: 'boolean', raw_register: null, raw_value: null }, row)
        else throw new Error('Unsupported PLC point')
      }
      if (batch.get(asset.asset_code)?.size !== 15) throw new Error('Incomplete PLC snapshot')
    } else {
      if (!Array.isArray(body) || !body.length || body.length > 33) throw new Error('Invalid array batch')
      for (const row of body) {
        const asset = assets.find(a => a.asset_id === row.asset_id && a.device_id === row.device_id)
        const metadata = asset && points.find(p => p.asset_id === asset.asset_id && p.point_id === row.point_id)
        if (!metadata) throw new Error('Point does not belong to this producer')
        if (producer === 'barrels' && !metadata.point_code.endsWith('_LEVEL_PERCENT')) throw new Error('Only current barrel percentages are accepted')
        put(asset, metadata, row)
      }
      // The deployed publisher omits a failed sensor. A healthy barrel must
      // continue updating independently; an omitted barrel keeps its own age.
      if (producer === 'chiller-1' && !batch.get(assets[0].asset_code)?.has('CH1_ONLINE')) throw new Error('CH1 status required')
    }
    // Validate the whole batch before replacing any state. Missing points disappear.
    for (const [code, readings] of batch) {
      snapshots.set(code, { received: now(), points: [...readings.values()] })
      receipts.set(code, new Date(now()).toISOString())
    }
    expire()
    return { ok: true }
  }
  function assetPoints(asset) {
    const sample = snapshots.get(asset.asset_code)
    if (!fresh(asset, sample)) return []
    if (asset.producer === 'chiller-2' || asset.producer === 'chiller-3') {
      const raw = sample.points
      const derived = Object.entries(DERIVED).map(([name, [reg, divisor]]) => {
        const p = raw.find(p => p.raw_register === reg)
        return { point_code: `CH2_${name}`, point_name: name.replaceAll('_', ' '), data_type: 'number', value_number: p.value_number / divisor, value_boolean: null, value_text: null, unit: name.includes('_F') ? 'F' : 'GPM', updated_at: p.updated_at }
      })
      return [...raw, ...derived].map((p, i) => ({ ...asset, point_id: p.point_code, point_group: 'monitoring', display_order: i, ...p }))
    }
    return sample.points.map(p => ({ ...asset, ...p }))
  }
  function dashboard(n) {
    const asset = ASSETS[n - 1]
    const rows = assetPoints(asset)
    const find = code => rows.find(p => p.point_code === `CH2_${code}`)
    const result = { asset_code: asset.asset_code, device_code: asset.device_code, latest_updated_at: rows[0]?.updated_at || null }
    for (const bit of BITS) result[bit.toLowerCase()] = find(bit)?.value_boolean ?? null
    for (const code of Object.keys(DERIVED)) result[code.toLowerCase()] = find(code)?.value_number ?? null
    return result
  }
  function overview() {
    return ASSETS.map(slot => {
      // The existing website labels physical left/right barrels in this order.
      const asset = slot.asset_type === 'barrel' ? ASSETS.find(a => a.asset_code === (slot.asset_code === 'BARREL-NJ-01' ? 'BARREL-NJ-02' : 'BARREL-NJ-01')) : slot
      const rows = assetPoints(asset)
      const row = { asset_code: slot.asset_code, asset_name: slot.asset_name, asset_type: slot.asset_type, updated_at: rows[0]?.updated_at || null, is_online: rows.length > 0, level_percent: rows.find(p => p.point_code.endsWith('_LEVEL_PERCENT'))?.value_number ?? null, has_error: rows.find(p => /_(ALARM|HAS_ERROR)$/.test(p.point_code))?.value_boolean ?? null }
      for (const bit of BITS.slice(1)) row[bit.toLowerCase()] = asset.producer === 'chiller-1' ? null : rows.find(p => p.point_code === `CH2_${bit}`)?.value_boolean ?? null
      if (asset.producer === 'chiller-1') {
        row.comp_1a_enabled = rows.find(p => p.point_code === 'CH1_COMP1')?.value_boolean ?? null
        row.comp_1b_enabled = rows.find(p => p.point_code === 'CH1_COMP2')?.value_boolean ?? null
        row.is_online &&= rows.some(p => p.point_code === 'CH1_ONLINE' && p.value_boolean === true)
      }
      return row
    })
  }
  function read(view) {
    expire()
    if (view === 'v_asset_points_latest') return ASSETS.flatMap(assetPoints).map(({ producer, ttl, ...row }) => row)
    if (view === 'v_nj_monitoring_overview') return overview()
    if (view === 'v_ch2_dashboard' || view === 'v_ch3_dashboard') return [dashboard(view === 'v_ch2_dashboard' ? 2 : 3)]
    if (view === 'ch2_latest' || view === 'ch3_latest') return assetPoints(ASSETS[view === 'ch2_latest' ? 1 : 2]).filter(p => p.raw_register != null).map(({ producer, ttl, ...row }) => row)
    throw new Error('Unknown view')
  }
  function status() {
    expire()
    const devices = ASSETS.map(a => ({ asset_code: a.asset_code, online: fresh(a, snapshots.get(a.asset_code)) === true, last_received_at: receipts.get(a.asset_code) || null, points: snapshots.get(a.asset_code)?.points.length || 0 }))
    return { storage: 'memory', history: false, devices, all_online: devices.every(d => d.online) }
  }
  return { ingest, read, status, expire }
}
