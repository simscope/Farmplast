import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { isCh3Online } from '../src/utils/ch3Status.js'

test('CH3 freshness handles fresh, expired, missing and invalid timestamps deterministically', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z')
  for (const [age, expected] of [[10000,true],[44000,true],[44999,true],[45000,false],[45001,false],[60000,false]]) {
    assert.equal(isCh3Online(new Date(now-age).toISOString(), now), expected)
  }
  for (const timestamp of [null,undefined,'',' ','invalid',0]) assert.equal(isCh3Online(timestamp, now), false)
  const timestamp = '2026-09-12T11:59:16.000Z'
  assert.equal(isCh3Online(timestamp, now), true)
  assert.equal(isCh3Online(timestamp, now+5000), false, 'unchanged telemetry expires on a later refresh')
})

test('CH3 HMI uses latest_updated_at, not legacy is_online, without adding requests', async () => {
  const source = await readFile(new URL('../src/pages/Chiller3HMIPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /online: isCh3Online\(dashboard\?\.latest_updated_at\)/)
  assert.doesNotMatch(source, /dashboard\?\.is_online|dashboard\.is_online/)
  assert.deepEqual([...source.matchAll(/\.from\('([^']+)'\)/g)].map(m=>m[1]), ['v_ch3_dashboard','ch3_latest'])
  assert.match(source, /const POLL_MS = 5000/)
  assert.doesNotMatch(source, /postgres_changes|\.channel\(/)
})
