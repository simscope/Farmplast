import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNjTelemetryHandler, filterTelemetryRows } from '../server/njTelemetryProxy.mjs'
import { PostgrestClient } from '@supabase/postgrest-js'
import { createTelemetryState } from '../../telemetry/state.mjs'
import { createTelemetryServer } from '../../telemetry/server.mjs'
import { plc, barrels, ch1 } from '../../telemetry/fixtures.mjs'

test('PostgREST projections, raw filters and barrel routing are supported without mutation', () => {
  const input = [{ asset_code: 'CH-NJ-02', raw_register: 40024, value_number: 510 }, { asset_code: 'CH-NJ-03', raw_register: 40025, value_number: 500 }]
  const out = filterTelemetryRows(input, new URLSearchParams('select=value_number&raw_register=in.(40024,40025)&asset_code=eq.CH-NJ-02'))
  assert.deepEqual(out, [{ value_number: 510 }])
  assert.equal(input.length, 2)
  assert.deepEqual(filterTelemetryRows([{ comp_1a_enabled: false }], new URLSearchParams('select=comp_1a_enabled')), [{ comp_1a_enabled: false }])
  assert.throws(() => filterTelemetryRows(input, new URLSearchParams('role=eq.admin')))
})
test('proxy uses verified user allowlist and never forwards a browser token to MSI', async () => {
  const env = { NJ_TELEMETRY_UPSTREAM: 'https://msi.tail4626fb.ts.net:10000', NJ_TELEMETRY_ALLOWED_USER_IDS: 'operator-id', NJ_TELEMETRY_READ_KEY: 'private-read-key', VITE_SUPABASE_URL: 'https://eeobivvwjzakbweluwtm.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key' }
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify(url.includes('/auth/') ? { id: 'operator-id' } : [{ asset_code: 'CH-NJ-02', system_running: false }]), { status: 200 })
  }
  const handler = createNjTelemetryHandler(env, fetcher)
  const req = { method: 'GET', url: '/api/nj-telemetry?view=v_ch2_dashboard&select=asset_code,system_running', headers: { authorization: 'Bearer ' + 'x'.repeat(80), accept: 'application/vnd.pgrst.object+json' } }
  const result = {}
  const res = { setHeader(k, v) { result[k] = v }, status(code) { result.status = code; return this }, json(body) { result.body = body } }
  await handler(req, res)
  assert.equal(result.status, 200)
  assert.equal(result.body.system_running, false)
  assert.match(result['Cache-Control'], /no-store/)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private-read-key')
  assert.equal(calls[1].options.redirect, 'error')
  calls.length = 0
  await handler({ ...req, method: 'POST' }, res)
  assert.equal(result.status, 405)
  assert.equal(calls.length, 0)
  await handler({ ...req, headers: {} }, res)
  assert.equal(result.status, 401)
  assert.equal(calls.length, 0)
  const denied = createNjTelemetryHandler(env, async () => new Response(JSON.stringify({ id: 'attacker', user_metadata: { role: 'admin' } })))
  await denied(req, res)
  assert.equal(result.status, 403)
})

test('real SDK queries cross the read proxy and HTTP RAM server, then lose expired values', async t => {
  let clock = Date.now()
  const state = createTelemetryState(() => clock)
  state.ingest('chiller-1', ch1()); state.ingest('chiller-2', plc()); state.ingest('chiller-3', plc(3)); state.ingest('barrels', barrels())
  const config = { readKey: 'r'.repeat(64), devices: Object.fromEntries(['chiller-1', 'chiller-2', 'chiller-3', 'barrels'].map((id, i) => [id, String(i).repeat(64)])) }
  const server = createTelemetryServer(config, state)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const env = { NJ_TELEMETRY_UPSTREAM: 'https://msi.tail4626fb.ts.net:10000', NJ_TELEMETRY_READ_KEY: config.readKey, NJ_TELEMETRY_ALLOWED_USER_IDS: 'operator', VITE_SUPABASE_URL: 'https://auth.invalid', VITE_SUPABASE_ANON_KEY: 'public-test-key' }
  const handler = createNjTelemetryHandler(env, async (url, options) => url.startsWith('https://auth.invalid/') ? new Response('{"id":"operator"}') : fetch(base + new URL(url).pathname, options))
  const sdk = new PostgrestClient('https://site.invalid/api/nj-telemetry', { fetch: async (url, options) => {
    const parsed = new URL(url)
    const headers = Object.fromEntries(new Headers(options.headers))
    headers.authorization = 'Bearer ' + 't'.repeat(80)
    let status, body
    await handler({ method: options.method, url, headers, query: { view: parsed.pathname.split('/').at(-1) } }, { setHeader() {}, status(code) { status = code; return this }, json(value) { body = value } })
    return new Response(JSON.stringify(body), { status })
  } })
  const overview = await sdk.from('v_nj_monitoring_overview').select('asset_code,comp_1a_enabled,level_percent').order('asset_code')
  assert.equal(overview.error, null)
  assert.equal(overview.data.length, 5)
  assert.equal(overview.data.find(r => r.asset_code === 'BARREL-NJ-01').level_percent, 0)
  const detail = await sdk.from('v_asset_points_latest').select('point_code,value_number').eq('asset_code', 'CH-NJ-01').order('display_order')
  assert.equal(detail.error, null)
  assert.equal(detail.data.length, 19)
  const raw = await sdk.from('ch3_latest').select('point_code, raw_register, raw_value').in('raw_register', [40024, 40025]).order('raw_register', { ascending: true })
  assert.equal(raw.error, null)
  assert.equal(raw.data.length, 2)
  const dashboard = await sdk.from('v_ch3_dashboard').select('comp_1a_enabled,chiller_entering_f').single()
  assert.deepEqual(dashboard.data, { comp_1a_enabled: false, chiller_entering_f: 50 })
  clock += 45000
  const expired = await sdk.from('v_ch3_dashboard').select('chiller_entering_f,latest_updated_at').single()
  assert.deepEqual(expired.data, { chiller_entering_f: null, latest_updated_at: null })
})

test('hybrid cutover reads migrated chillers only from MSI and keeps the two barrels on their existing feed',async()=>{
 const env={NJ_TELEMETRY_UPSTREAM:'https://msi.tail4626fb.ts.net:10000',NJ_TELEMETRY_READ_KEY:'server-key',NJ_TELEMETRY_ALLOWED_USER_IDS:'operator',NJ_TELEMETRY_MSI_ASSETS:'CH-NJ-01,CH-NJ-02,CH-NJ-03',VITE_SUPABASE_URL:'https://auth.invalid',VITE_SUPABASE_ANON_KEY:'public'}
 const calls=[]
 let cloudFails=false
 const handler=createNjTelemetryHandler(env,async(url,options)=>{
  calls.push({url,options})
  if(url.endsWith('/auth/v1/user'))return new Response('{"id":"operator"}')
  if(url.startsWith(env.NJ_TELEMETRY_UPSTREAM))return new Response(JSON.stringify([{asset_code:'CH-NJ-01',is_online:true,level_percent:null},{asset_code:'BARREL-NJ-01',is_online:false,level_percent:null},{asset_code:'BARREL-NJ-02',is_online:false,level_percent:null}]))
  if(cloudFails)return new Response('{}',{status:503})
  return new Response(JSON.stringify([{asset_code:'BARREL-NJ-01',is_online:true,level_percent:0},{asset_code:'BARREL-NJ-02',is_online:true,level_percent:75},{asset_code:'CH-NJ-01',is_online:false,level_percent:999}]))
 })
 const result={}
 const req={method:'GET',url:'/api/nj-telemetry?view=v_nj_monitoring_overview',headers:{authorization:'Bearer '+'x'.repeat(80)}}
 const res={setHeader(){},status(code){result.status=code;return this},json(body){result.body=body}}
 await handler(req,res)
 assert.equal(result.status,200)
 assert.equal(result.body.find(r=>r.asset_code==='CH-NJ-01').is_online,true)
 assert.equal(result.body.find(r=>r.asset_code==='BARREL-NJ-01').level_percent,0)
 assert.equal(new URL(calls[2].url).searchParams.get('asset_code'),'in.(BARREL-NJ-01,BARREL-NJ-02)')
 assert.equal(calls[2].options.headers.Authorization,req.headers.authorization)
 cloudFails=true
 await handler(req,res)
 assert.equal(result.status,200)
 assert.equal(result.body.find(r=>r.asset_code==='CH-NJ-01').is_online,true)
 assert.equal(result.body.find(r=>r.asset_code==='BARREL-NJ-01').level_percent,null)
 assert.equal(result.body.find(r=>r.asset_code==='BARREL-NJ-01').is_online,false)
})
