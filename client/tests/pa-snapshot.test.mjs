import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptPaSnapshot, PA_CABINET_KEY, PA_STALE_MS } from '../src/components/monitoring/pa/snapshot.js'
import { PA_PLANT } from '../src/components/monitoring/pa/config.js'

const now = Date.parse('2026-09-23T12:00:00Z')
// Synthetic unit-test fixtures only, never imported by the application/publisher.
const fixture = () => ({schema_version:1,device_key:PA_CABINET_KEY,boot_id:'unit-test',sequence:1,
  uptime_sec:15,source_mode:'LIVE',updated_at:new Date(now).toISOString(),
  barrels:PA_PLANT.barrels.map(({id})=>({id})),mixers:PA_PLANT.mixers.map(({id})=>({id}))})
const adapt = value => adaptPaSnapshot(value,{now,configured:true})

test('absent/empty snapshots never produce live state or healthy alarms',()=>{
  for(const source of [null,undefined,{}]) {
    const result=adapt(source)
    assert.equal(result.cabinetConnection,'NO DATA')
    assert.equal(result.barrels[0].telemetry.levelPercent,null)
    assert.equal(result.mixers[0].telemetry.operation,null)
    assert.equal(result.alarms,null)
  }
  assert.equal(adaptPaSnapshot(null).cabinetConnection,'NOT CONFIGURED')
})
test('real zero and supported units map; absent/invalid measurements stay null',()=>{
  const source=fixture()
  Object.assign(source.barrels[0],{sensor_status:'ONLINE',level_percent:0,distance_mm:120,sensor_temperature_f:72,snr_db:0})
  assert.equal(adapt(source).barrels[0].telemetry.levelPercent,0)
  assert.equal(adapt(source).barrels[0].telemetry.distance,120)
  assert.equal(adapt(source).barrels[0].telemetry.sensorTemperature,72)
  assert.equal(adapt(source).barrels[0].telemetry.snr,0)
  for(const value of [undefined,null,'',false,'0',NaN,Infinity,-1,101]) {
    source.barrels[0].level_percent=value
    assert.equal(adapt(source).barrels[0].telemetry.levelPercent,null)
  }
  assert.equal(adapt(source).mixers[0].telemetry.current,null)
})
test('commands are not run feedback; explicit false means STOPPED',()=>{
  const source=fixture()
  source.mixers[0].commanded_state='START'
  assert.equal(adapt(source).mixers[0].telemetry.operation,null)
  source.mixers[0].run_feedback=false
  source.mixers[1].run_feedback=true
  source.mixers[2].run_feedback=false
  source.mixers[0].runtime_sec=3600
  source.mixers[0].current_a=0
  assert.equal(adapt(source).mixers[0].telemetry.operation,'STOPPED')
  assert.equal(adapt(source).mixers[0].telemetry.runtimeHours,1)
  assert.equal(adapt(source).mixers[0].telemetry.current,0)
  assert.equal(adapt(source).mixerSummary,'1 / 3 RUNNING')
})
test('stale, future, invalid timestamps and TEST mode suppress live readings',()=>{
  const source=fixture()
  source.barrels[0]={...source.barrels[0],sensor_status:'ONLINE',level_percent:50}
  source.mixers[0].fault=true
  for(const timestamp of [new Date(now-PA_STALE_MS).toISOString(),new Date(now+1).toISOString(),'bad',null]) {
    source.updated_at=timestamp
    const result=adapt(source)
    assert.notEqual(result.cabinetConnection,'ONLINE')
    assert.equal(result.barrels[0].telemetry.levelPercent,null)
    assert.equal(result.alarms,null)
  }
  source.updated_at=new Date(now-PA_STALE_MS+1).toISOString()
  assert.equal(adapt(source).cabinetConnection,'ONLINE')
  source.source_mode='TEST'
  assert.equal(adapt(source).cabinetConnection,'TEST MODE')
  assert.equal(adapt(source).barrels[0].telemetry.levelPercent,null)
})
test('only explicit alarms create records; no invented thresholds or false health',()=>{
  const source=fixture()
  source.barrels[0].level_percent=0
  source.mixers[0].fault=false
  assert.equal(adapt(source).alarms,null)
  assert.equal(adapt(source).mixers[0].telemetry.fault,null)
  source.mixers[0].overload=true
  source.barrels[1].sensor_error='E42'
  source.barrels[2].high_level_alarm=true
  assert.equal(adapt(source).alarms.length,3)
  source.mixers[0].overload=false
  source.barrels[1].sensor_error=null
  source.barrels[2].high_level_alarm=false
  source.alarm_data_complete=true
  assert.deepEqual(adapt(source).alarms,[])
})
test('wrong identity/version, duplicate or missing slots fail closed',()=>{
  for(const field of ['device_key','schema_version','source_mode','sequence','boot_id','uptime_sec']) {
    const source=fixture();source[field]=null
    assert.equal(adapt(source).cabinetConnection,'NO DATA')
  }
  const source=fixture();source.barrels[1].id=source.barrels[0].id
  assert.equal(adapt(source).cabinetConnection,'NO DATA')
  source.barrels=[]
  assert.equal(adapt(source).cabinetConnection,'NO DATA')
})
test('sensor invalidity hides measurements; assignment is explicit, immutable',()=>{
  const source=fixture()
  source.barrels[0].level_percent=20
  source.barrels[0].sensor_status='OFFLINE'
  source.mixers[2].assigned_barrel_id='pa-barrel-1'
  const before=JSON.stringify(source)
  assert.equal(adapt(source).barrels[0].telemetry.levelPercent,null)
  assert.equal(adapt(source).mixers[2].barrelId,'pa-barrel-1')
  assert.equal(adapt(source).mixers[0].barrelId,null)
  assert.equal(JSON.stringify(source),before)
  assert.equal(PA_PLANT.mixers[2].barrelId,null)
})
