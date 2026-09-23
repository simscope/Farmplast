import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptClimateSnapshot, withClimateState, PA_CLIMATE_KEY, PA_CLIMATE_STALE_MS } from '../src/components/monitoring/pa/climateSnapshot.js'
import { PA_CLIMATE_ZONE_CONFIG } from '../src/components/monitoring/pa/climateConfig.js'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const now=Date.parse('2026-09-23T12:00:00Z')
const stamp=new Date(now).toISOString()
// Synthetic unit fixtures only, not application/publisher inputs.
const fixture=()=>({schema_version:1,device_key:PA_CLIMATE_KEY,boot_id:'unit-test',sequence:1,source_mode:'LIVE',updated_at:stamp,
  zones:PA_CLIMATE_ZONE_CONFIG.map(({id})=>({id,updated_at:stamp}))})
const adapt=(source, options={})=>adaptClimateSnapshot(source,{now,configured:true,...options})

test('empty source/zone stays NO DATA, including unknown health and alarms',()=>{
  for(const source of [null,{},fixture()]) {
    const state=adapt(source);const zone=state.zones[0]
    assert.equal(zone.temperatureF,null);assert.equal(zone.humidityPercent,null)
    assert.equal(zone.mode,'NO_DATA');assert.equal(zone.heatingActive,null)
    assert.equal(zone.sensorOnline,null);assert.equal(state.summary,null);assert.equal(state.alarms,null)
  }
  assert.equal(adaptClimateSnapshot(null).zones[0].connection,'NOT CONFIGURED')
})
test('zero temperature/humidity/setpoint and false feedback are real values',()=>{
  const source=fixture();Object.assign(source.zones[0],{temperature_f:0,humidity_percent:0,setpoint_f:0,outputs:{heating:false,cooling:false,fan:false}})
  const zone=adapt(source).zones[0]
  assert.equal(zone.temperatureF,0);assert.equal(zone.humidityPercent,0);assert.equal(zone.setpointF,0)
  assert.equal(zone.heatingActive,false);assert.equal(zone.coolingActive,false)
  for(const value of [null,undefined,'',false,'0',NaN,Infinity]) {
    source.zones[0].temperature_f=value
    assert.equal(adapt(source).zones[0].temperatureF,null)
  }
  source.zones[0].humidity_percent=101
  assert.equal(adapt(source).zones[0].humidityPercent,null)
})
test('gateway and individual zone expiry are independent, exact boundary stale',()=>{
  const source=fixture();source.zones[0].temperature_f=72
  source.zones[0].updated_at=new Date(now-PA_CLIMATE_STALE_MS).toISOString()
  assert.equal(adapt(source).zones[0].connection,'STALE')
  assert.equal(adapt(source).zones[0].temperatureF,null)
  assert.equal(adapt(source).zones[1].connection,'ONLINE')
  source.updated_at=source.zones[0].updated_at
  source.zones.forEach(zone=>{zone.updated_at=source.updated_at})
  assert.ok(adapt(source).zones.every(zone=>zone.connection==='STALE'))
})
test('requested COOL and setpoint never imply actual mode or cooling',()=>{
  const source=fixture();Object.assign(source.zones[0],{requested_mode:'COOL',temperature_f:90,setpoint_f:70})
  assert.equal(adapt(source).zones[0].requestedMode,'COOL')
  assert.equal(adapt(source).zones[0].mode,'NO_DATA')
  assert.equal(adapt(source).zones[0].coolingActive,null)
  source.zones[0].actual_mode='COOL'
  assert.equal(adapt(source).zones[0].coolingActive,null)
  source.zones[0].outputs={cooling:false,fan:true}
  assert.equal(adapt(source).zones[0].coolingActive,false)
  assert.equal(adapt(source).zones[0].fanActive,true)
})
test('all seven explicit alarms map; no inferred thresholds/offline alarms',()=>{
  const source=fixture();source.zones[0].temperature_f=200
  source.zones[0].sensor_online=false
  assert.equal(adapt(source).alarms,null)
  const flags=['sensor_fault','controller_offline','high_temperature','low_temperature','high_humidity','low_humidity','hvac_output_fault']
  for(const flag of flags) {
    source.zones[0].alarms={[flag]:true}
    const state=adapt(source)
    assert.equal(state.alarms.length,1);assert.equal(state.zones[0].alarm,true)
    assert.match(state.alarms[0].id,new RegExp(flag+'$'))
  }
  source.zones[0].alarms={sensor_fault:false}
  assert.equal(adapt(source).alarms,null)
  source.zones.forEach(zone=>{zone.alarm_data_complete=true})
  assert.deepEqual(adapt(source).alarms,[])
  source.zones[1].updated_at=null
  assert.equal(adapt(source).alarms,null)
})
test('health aggregation requires explicit complete health, no implied healthy zones',()=>{
  const source=fixture()
  source.zones.forEach(zone=>Object.assign(zone,{sensor_online:true,controller_online:true}))
  assert.equal(adapt(source).summary,'8 / 8 ONLINE')
  source.zones[0].sensor_online=false
  assert.equal(adapt(source).summary,'7 / 8 ONLINE')
  source.zones[0].controller_online=null
  assert.equal(adapt(source).summary,null)
})
test('configuration supports nine zones, disables one, and isolates missing/duplicate slots',()=>{
  const config=[...PA_CLIMATE_ZONE_CONFIG,{...PA_CLIMATE_ZONE_CONFIG[0],id:'pa-zone-9',name:'Zone 9'}]
  const source=fixture();source.zones.unshift({id:'pa-zone-9',updated_at:stamp,temperature_f:75})
  assert.equal(adapt(source,{config}).zones.length,9)
  assert.equal(adapt(source,{config}).zones[8].temperatureF,75)
  const disabled=config.map(zone=>({...zone,enabled:zone.id!=='pa-zone-2'}))
  assert.equal(adapt(source,{config:disabled}).zones.length,8)
  source.zones=source.zones.filter(zone=>zone.id!=='pa-zone-1')
  assert.equal(adapt(source,{config}).zones[0].connection,'NO DATA')
  assert.equal(adapt(source,{config}).zones[8].temperatureF,75)
  source.zones.push({...source.zones[0]})
  assert.equal(adapt(source,{config}).zones[8].connection,'NO DATA')
  assert.throws(()=>adapt(source,{config:[config[0],config[0]]}),/unique/)
})
test('invalid identity, future timestamps, TEST and failed health suppress readings',()=>{
  const source=fixture();Object.assign(source.zones[0],{temperature_f:72,outputs:{cooling:true},setpoint_f:70})
  source.source_mode='TEST'
  assert.equal(adapt(source).zones[0].temperatureF,null)
  assert.equal(adapt(source).zones[0].coolingActive,null)
  source.source_mode='LIVE';source.zones[0].updated_at=new Date(now+1).toISOString()
  assert.equal(adapt(source).zones[0].connection,'NO DATA')
  source.zones[0].updated_at=stamp;source.zones[0].sensor_online=false;source.zones[0].controller_online=false
  assert.equal(adapt(source).zones[0].temperatureF,null)
  assert.equal(adapt(source).zones[0].setpointF,null)
  assert.equal(adapt(source).zones[0].coolingActive,null)
  source.device_key='wrong'
  assert.equal(adapt(source).zones[0].connection,'NO DATA')
})
test('climate alarms merge without erasing earlier alarms or declaring unknown plant healthy',()=>{
  const climate=adapt(fixture())
  assert.equal(withClimateState({alarms:null},climate).alarms,null)
  assert.equal(withClimateState({alarms:null},{...climate,alarms:[]}).alarms,null)
  const previous={id:'existing',message:'existing'}
  assert.deepEqual(withClimateState({alarms:[previous]},climate).alarms,[previous])
  assert.deepEqual(withClimateState({alarms:[]},{...climate,alarms:[]}).alarms,[])
})
test('climate card renders unknowns and explicit output feedback separately',async()=>{
  const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'})
  try {
    const {default:Card}=await server.ssrLoadModule('/src/components/monitoring/pa/ClimateZoneCard.jsx')
    const render=zone=>renderToStaticMarkup(createElement(Card,{device:zone}))
    assert.match(render(adapt(null).zones[0]),/NO DATA/)
    assert.doesNotMatch(render(adapt(null).zones[0]),/0 °F|0 %/)
    const source=fixture();Object.assign(source.zones[0],{temperature_f:0,humidity_percent:0,requested_mode:'COOL'})
    const html=render(adapt(source).zones[0])
    assert.match(html,/0 °F/);assert.match(html,/0 %/);assert.doesNotMatch(html,/>ON</)
    source.zones[0].outputs={cooling:true}
    assert.match(render(adapt(source).zones[0]),/Cooling feedback<\/dt><dd>ON/)
  } finally {await server.close()}
})
