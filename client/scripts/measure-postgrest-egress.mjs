// Read-only public telemetry GETs. Never emits credentials or telemetry values.
// Run from client: node --env-file=.env scripts/measure-postgrest-egress.mjs
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { CHILLERS_COLUMNS, CHILLERS_POINT_CODES } from '../src/utils/chillersTelemetry.js'
import { OVERVIEW_COLUMNS, POINT_DETAIL_COLUMNS } from '../src/utils/monitoringColumns.js'

const origin = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!origin || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
const oldRaw = 'point_code,point_name,value_number,value_boolean,raw_register,raw_value,updated_at'
const newRaw = 'value_number,raw_register,raw_value'
const queries = [
  ['legacy-before', 'v_asset_points_latest', {select:'*',or:'(point_code.like.CH2_%,point_code.like.CH3_%)',order:'point_code.asc'}, 360],
  ['legacy-after', 'v_asset_points_latest', {select:CHILLERS_COLUMNS,point_code:`in.(${CHILLERS_POINT_CODES.join(',')})`,order:'point_code.asc'}, 360],
  ['nj-overview', 'v_nj_monitoring_overview', {select:OVERVIEW_COLUMNS,order:'asset_code.asc'}, 240],
  ['ch1-hmi', 'v_asset_points_latest', {select:POINT_DETAIL_COLUMNS,asset_code:'eq.CH-NJ-01',order:'display_order.asc'}, 720],
]
for (const ch of [2,3]) {
  const source = await readFile(new URL(`../src/pages/Chiller${ch}HMIPage.jsx`, import.meta.url), 'utf8')
  const columns = source.match(/const CH[23]_DASHBOARD_COLUMNS = '([^']+)'/)[1]
  queries.push([`ch${ch}-dashboard`, `v_ch${ch}_dashboard`, {select:columns}, 720, true])
  for (const [label, select] of [['before',oldRaw],['after',newRaw]]) {
    queries.push([`ch${ch}-raw-${label}`, `ch${ch}_latest`, {select,raw_register:'in.(40023,40024,40025,40051,40052,40056,40057,40061)',order:'raw_register.asc'}, 720])
  }
}
const measurements = []
for (const [name, endpoint, params, requestsPerHour, single] of queries) {
  const response = await fetch(`${origin}/rest/v1/${endpoint}?${new URLSearchParams(params)}`, {
    headers: {apikey:key, Authorization:`Bearer ${key}`, 'Accept-Encoding':'identity',
      Accept: single ? 'application/vnd.pgrst.object+json' : 'application/json'},
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const body = Buffer.from(await response.arrayBuffer())
  const parsed = JSON.parse(body)
  measurements.push({name, endpoint, params, measuredAt:new Date().toISOString(),
    rows:Array.isArray(parsed) ? parsed.length : 1, requestsPerHour,
    responseBodyBytes:body.length, contentEncoding:response.headers.get('content-encoding'),
    localGzipBytes:gzipSync(body).length,
    hypothetical24hVisibleBodyMB:body.length * requestsPerHour * 24 / 1e6})
}
console.log(JSON.stringify({note:'Identity response bytes; local gzip is a reproducible comparison, not measured wire/billed bytes. Rates assume one continuously visible page. Legacy route is not mounted in production.',measurements}, null, 2))
