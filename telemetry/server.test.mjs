import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTelemetryServer } from './server.mjs'
import { barrels } from './fixtures.mjs'

const config = { readKey: 'r'.repeat(64), devices: Object.fromEntries(['chiller-1', 'chiller-2', 'chiller-3', 'barrels'].map((id, i) => [id, String(i).repeat(64)])) }
test('HTTP service requires separate scoped keys, forbids writes and chiller cutover', async t => {
  const server = createTelemetryServer(config)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}`
  const get = (path, key) => fetch(base + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
  assert.equal((await get('/healthz')).status, 200)
  assert.equal((await get('/v1/read/v_nj_monitoring_overview')).status, 401)
  assert.equal((await get('/v1/read/v_nj_monitoring_overview', config.devices.barrels)).status, 401)
  const post = key => fetch(base + '/v1/ingest/barrels', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(barrels()) })
  assert.equal((await post(config.readKey)).status, 401)
  assert.equal((await post(config.devices['chiller-2'])).status, 401)
  assert.equal((await post(config.devices.barrels)).status, 200)
  const data = await get('/v1/read/v_nj_monitoring_overview', config.readKey)
  assert.match(data.headers.get('cache-control'), /no-store/)
  assert.equal((await data.json())[3].level_percent, 0)
  assert.equal((await fetch(base + '/v1/read/ch2_latest', { method: 'POST', headers: { Authorization: `Bearer ${config.readKey}` } })).status, 405)
  assert.equal((await get('/v1/read/employees', config.readKey)).status, 404)
  const closed = await fetch(base + '/v1/ingest/chiller-2', { method: 'POST', headers: { Authorization: `Bearer ${config.devices['chiller-2']}` } })
  assert.equal(closed.status, 503)
})
