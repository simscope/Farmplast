import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTelemetryState, ASSETS } from './state.mjs'
import { plc, barrels, ch1 } from './fixtures.mjs'

test('all five inputs preserve CH3 wire prefix, Modbus scaling and physical barrel order', () => {
  const state = createTelemetryState(() => 1000)
  state.ingest('chiller-1', ch1())
  state.ingest('chiller-2', plc())
  state.ingest('chiller-3', plc(3, 600))
  state.ingest('barrels', barrels())
  assert.equal(state.status().all_online, true)
  const overview = state.read('v_nj_monitoring_overview')
  assert.equal(overview.length, 5)
  assert.equal(overview.find(r => r.asset_code === 'BARREL-NJ-01').level_percent, 0)
  assert.equal(overview.find(r => r.asset_code === 'BARREL-NJ-02').level_percent, 76)
  assert.equal(state.read('v_ch3_dashboard')[0].chiller_entering_f, 60)
  assert.equal(state.read('v_ch3_dashboard')[0].flow_c1_gpm, 600)
  assert.equal(state.read('v_ch2_dashboard')[0].comp_1a_enabled, false)
})
test('exact freshness thresholds erase readings and mark offline', () => {
  let time = 0
  const state = createTelemetryState(() => time)
  state.ingest('chiller-1', ch1()); state.ingest('chiller-2', plc()); state.ingest('barrels', barrels())
  time = 15999; assert.equal(state.status().devices[0].online, true)
  time = 16000; assert.equal(state.status().devices[0].online, false)
  time = 35000; assert.equal(state.read('v_nj_monitoring_overview')[3].level_percent, null)
  time = 44999; assert.equal(state.status().devices[1].online, true)
  time = 45000; assert.equal(state.read('v_ch2_dashboard')[0].chiller_entering_f, null)
  assert.equal(state.read('v_asset_points_latest').length, 0)
})
test('overwrites stay bounded, restart restores no readings', () => {
  const state = createTelemetryState(() => 1000)
  for (let i = 0; i < 1000; i++) state.ingest('chiller-2', plc(2, i))
  assert.equal(state.read('v_asset_points_latest').length, 21)
  assert.equal(state.read('v_ch2_dashboard')[0].chiller_entering_f, 99.9)
  assert.equal(createTelemetryState().read('v_asset_points_latest').length, 0)
})
test('invalid and cross-device batches leave the complete prior snapshot unchanged', () => {
  const state = createTelemetryState(() => 1000)
  state.ingest('barrels', barrels())
  for (const invalid of [barrels(-1), barrels(101), [], [{ ...barrels()[0], device_id: ASSETS[0].device_id }, barrels()[1]]]) {
    assert.throws(() => state.ingest('barrels', invalid))
    assert.equal(state.read('v_nj_monitoring_overview')[3].level_percent, 0)
  }
  assert.throws(() => state.ingest('chiller-3', plc(2)))
  const duplicate = plc(); duplicate.payload.readings[0] = duplicate.payload.readings[1]
  assert.throws(() => state.ingest('chiller-2', duplicate))
  assert.throws(() => state.ingest('chiller-2', plc(2, NaN)))
  const bad = plc(); bad.payload.readings[8].value_boolean = 'false'
  assert.throws(() => state.ingest('chiller-2', bad))
})
test('one failed barrel sensor cannot stop or refresh the other barrel', () => {
  let clock = 0
  const state = createTelemetryState(() => clock)
  state.ingest('barrels', barrels(0, 76))
  clock = 34000
  state.ingest('barrels', [barrels(12, 76)[1]])
  clock = 35000
  const rows = state.read('v_nj_monitoring_overview')
  assert.equal(rows[3].level_percent, 12)
  assert.equal(rows[3].is_online, true)
  assert.equal(rows[4].level_percent, null)
  assert.equal(rows[4].is_online, false)
})
test('an omitted sensor does not retain its earlier reading', () => {
  const state = createTelemetryState(() => 1000)
  state.ingest('chiller-1', ch1())
  state.ingest('chiller-1', ch1().filter(p => p.point_id !== '18ccc8fe-9e7b-4d90-b8ef-e84a35458183'))
  assert.equal(state.read('v_asset_points_latest').some(p => p.point_code === 'CH1_CDW_OUT'), false)
})
