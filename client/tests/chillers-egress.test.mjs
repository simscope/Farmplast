import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { loadChillersTelemetry, CHILLERS_COLUMNS, CHILLERS_POINT_CODES, CHILLERS_POLL_MS } from '../src/utils/chillersTelemetry.js'
import { startMonitoringPolling } from '../src/utils/monitoringPolling.js'

const source = await readFile(new URL('../src/pages/ChillersPage.jsx', import.meta.url), 'utf8')
const flush = () => new Promise(resolve => setImmediate(resolve))

test('legacy reader sends only displayed points and values through the actual PostgREST builder', async () => {
  let request
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession:false, autoRefreshToken:false },
    global: {fetch: async (url, options) => {
      request = {url:new URL(url), options}
      return new Response('[]', {headers:{'Content-Type':'application/json'}})
    }},
  })
  const controller = new AbortController()
  await loadChillersTelemetry(client, controller.signal)
  assert.equal(request.url.pathname, '/rest/v1/v_asset_points_latest')
  assert.equal(request.url.searchParams.get('select'), 'point_code,value_number,value_boolean,updated_at')
  const usedSuffixes = [...source.matchAll(/\$\{prefix\}_([A-Z0-9_]+)/g)].map(m => m[1])
  assert.deepEqual(new Set(CHILLERS_POINT_CODES), new Set(['CH2','CH3'].flatMap(p => usedSuffixes.map(s => `${p}_${s}`))))
  assert.equal(request.url.searchParams.get('point_code'), `in.(${CHILLERS_POINT_CODES.join(',')})`)
  assert.equal(request.url.searchParams.get('or'), null)
  assert.equal(request.options.signal, controller.signal)
  assert.equal(CHILLERS_COLUMNS.split(',').length, 4)
})

test('legacy page uses a stable shared scheduler for manual and automatic refresh', () => {
  assert.equal(CHILLERS_POLL_MS, 10000)
  assert.match(source, /useCallback\(async \(signal, silent\)/)
  assert.match(source, /useMonitoringPolling\(loadTelemetry, CHILLERS_POLL_MS\)/)
  assert.match(source, /onClick=\{\(\) => refresh\(false\)\}/)
  assert.match(source, /if \(signal.aborted\) return/)
  assert.match(source, /if \(!signal.aborted\)/)
  assert.doesNotMatch(source, /\.select\(['"]\*|setInterval|\.channel\(/)
})

test('10s reader pauses hidden, refreshes once on restore, prevents overlap, and aborts on stop', async () => {
  const listeners = new Set(), intervals = new Map()
  const document = {visibilityState:'hidden', addEventListener:(_,f)=>listeners.add(f), removeEventListener:(_,f)=>listeners.delete(f)}
  const timers = {setInterval:(f,ms)=>{assert.equal(ms,10000); intervals.set(f,ms); return f},clearInterval:f=>intervals.delete(f)}
  let requests = 0, signal, finish
  const load = s => { requests++; signal=s; return new Promise(resolve=>{finish=resolve}) }
  const abandoned = startMonitoringPolling(load, CHILLERS_POLL_MS, document, timers)
  abandoned.stop()
  const session = startMonitoringPolling(load, CHILLERS_POLL_MS, document, timers)
  await flush(); assert.equal(requests,0)
  document.visibilityState='visible'; for (const f of listeners) f()
  assert.equal(requests,1); assert.equal(intervals.size,1)
  await session.refresh(false); for (const f of intervals.keys()) f()
  assert.equal(requests,1)
  finish(); await flush()
  document.visibilityState='hidden'; for (const f of listeners) f()
  await session.refresh(); assert.equal(requests,1); assert.equal(intervals.size,0)
  document.visibilityState='visible'; for (const f of listeners) f()
  assert.equal(requests,2); assert.equal(intervals.size,1)
  session.stop(); assert.equal(signal.aborted,true)
  finish(); await flush(); await session.refresh()
  assert.equal(requests,2); assert.equal(intervals.size,0); assert.equal(listeners.size,0)
})

for (const ch of [2,3]) {
  test(`CH${ch} retains visible 5s polling, eight-register fallback values, abort and no Realtime`, async () => {
    const hmi = await readFile(new URL(`../src/pages/Chiller${ch}HMIPage.jsx`, import.meta.url), 'utf8')
    assert.match(hmi, /'value_number, raw_register, raw_value'/)
    assert.match(hmi, /found.raw_value \?\? found.value_number/)
    assert.match(hmi, /const POLL_MS = 5000/)
    assert.match(hmi, /useMonitoringPolling\(loadTelemetry, POLL_MS\)/)
    assert.equal([...hmi.matchAll(/\.abortSignal\(signal\)/g)].length, 2)
    assert.doesNotMatch(hmi, /\.select\(['"]\*|setInterval|\.channel\(/)
  })
}
