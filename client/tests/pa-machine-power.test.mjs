import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptMachineSnapshot, PA_POWER_GATEWAY_KEY, PA_POWER_STALE_MS } from '../src/components/monitoring/pa/machineSnapshot.js'
import { PA_MACHINE_CONFIG } from '../src/components/monitoring/pa/machineConfig.js'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const now = Date.parse('2026-09-23T12:00:00Z')
const stamp = new Date(now).toISOString()
// Unit fixtures only. No simulated payload is imported by application code.
const fixture = () => ({schema_version:1,device_key:PA_POWER_GATEWAY_KEY,boot_id:'unit-test',sequence:1,source_mode:'LIVE',updated_at:stamp,
  machines:PA_MACHINE_CONFIG.map(({id})=>({id,updated_at:stamp}))})
const adapt = (source, options={}) => adaptMachineSnapshot(source,{now,configured:true,...options})

test('absent or empty machines give NO_DATA without synthesized run state',()=>{
  for(const source of [null,{},fixture()]) {
    const machine=adapt(source)[0]
    assert.equal(machine.telemetry.status,'NO_DATA')
    assert.equal(machine.telemetry.runFeedback,null)
    assert.equal(machine.telemetry.voltage['L1-L2'],null)
    assert.equal(machine.telemetry.current.L1,null)
  }
  assert.equal(adaptMachineSnapshot(null)[0].connection,'NOT CONFIGURED')
})
test('zero voltage/current/power survives; invalid and absent data stays null',()=>{
  const source=fixture(); const row=source.machines[0]
  row.voltage={l1_l2:0,l2_l3:null};row.current={l1:0};row.power={kw:0,pf:0,hz:0}
  const t=adapt(source)[0].telemetry
  assert.equal(t.voltage['L1-L2'],0);assert.equal(t.current.L1,0);assert.equal(t.kw,0)
  assert.equal(t.voltage['L2-L3'],null);assert.equal(t.current.L2,null)
  for(const value of ['',false,'0',NaN,Infinity,-1]) {
    row.voltage.l1_l2=value; row.current.l1=value
    assert.equal(adapt(source)[0].telemetry.voltage['L1-L2'],null)
    assert.equal(adapt(source)[0].telemetry.current.L1,null)
  }
})
test('gateway and each meter expire independently; test and future times fail closed',()=>{
  const source=fixture();source.machines[0].voltage={l1_l2:442}
  source.machines[0].updated_at=new Date(now-PA_POWER_STALE_MS).toISOString()
  assert.equal(adapt(source)[0].connection,'STALE')
  assert.equal(adapt(source)[0].telemetry.voltage['L1-L2'],null)
  assert.equal(adapt(source)[1].connection,'ONLINE')
  source.updated_at=new Date(now-PA_POWER_STALE_MS).toISOString()
  source.machines.forEach(row=>{row.updated_at=source.updated_at})
  assert.equal(adapt(source)[1].connection,'STALE')
  source.updated_at=stamp;source.machines[0].updated_at=new Date(now+1).toISOString()
  assert.equal(adapt(source)[0].connection,'NO DATA')
  source.machines[0].updated_at=stamp;source.source_mode='TEST'
  assert.equal(adapt(source)[0].connection,'TEST MODE')
  assert.equal(adapt(source)[0].telemetry.voltage['L1-L2'],null)
})
test('all explicit alarm flags map; unusual voltage alone causes no alarm',()=>{
  const source=fixture();source.machines[0].voltage={l1_l2:442}
  assert.equal(adapt(source)[0].telemetry.status,'NO_DATA')
  const fields={phase_loss:'phaseLoss',undervoltage:'undervoltage',overvoltage:'overvoltage',voltage_imbalance:'phaseImbalance',overcurrent:'overcurrent',phase_sequence:'phaseSequence',meter_fault:'meterFault'}
  for(const [raw,normalized] of Object.entries(fields)) {
    source.machines[0].alarms={[raw]:true}
    assert.equal(adapt(source)[0].telemetry[normalized],true)
    assert.equal(adapt(source)[0].telemetry.status,'ALARM')
    source.machines[0].alarms[raw]=false
    assert.equal(adapt(source)[0].telemetry[normalized],false)
  }
  source.machines[0].alarms={meter_fault:true};source.machines[0].updated_at=new Date(now-PA_POWER_STALE_MS).toISOString()
  assert.equal(adapt(source)[0].telemetry.meterFault,null)
  assert.equal(adapt(source)[0].lastReportedAlarms.meterFault,true)
})
test('current and commands cannot invent activity or run feedback',()=>{
  const source=fixture();Object.assign(source.machines[0],{current:{l1:100},commanded_state:'START'})
  assert.equal(adapt(source)[0].telemetry.status,'NO_DATA')
  assert.equal(adapt(source)[0].telemetry.runFeedback,null)
  source.machines[0].electrical_activity='ACTIVE';source.machines[0].run_feedback=false
  assert.equal(adapt(source)[0].telemetry.status,'ACTIVE')
  assert.equal(adapt(source)[0].telemetry.runFeedback,false)
})
test('configuration scales beyond four, filters disabled, matches IDs not positions',()=>{
  const config=[...PA_MACHINE_CONFIG,{...PA_MACHINE_CONFIG[0],id:'pa-machine-5',name:'Machine 5'}, {...PA_MACHINE_CONFIG[1],id:'pa-machine-6',name:'Machine 6',enabled:false}]
  const source=fixture();source.machines.unshift({id:'pa-machine-5',updated_at:stamp,power:{kw:5}})
  const result=adapt(source,{config})
  assert.equal(result.length,5);assert.equal(result[4].telemetry.kw,5)
  assert.equal(result[0].telemetry.kw,null)
  source.machines.push({...source.machines[0]})
  assert.equal(adapt(source,{config})[4].connection,'NO DATA')
  assert.throws(()=>adapt(source,{config:[config[0],config[0]]}),/unique/)
})
test('optional signed power and future measurements normalize with documented units',()=>{
  const source=fixture();Object.assign(source.machines[0],{power:{kw:-2,kva:4,kvar:-3,pf:-0.5,hz:60},voltage:{l1_n:120},current:{neutral:0},energy_kwh:0,runtime_sec:3600,start_count:0,demand_kw:2})
  const t=adapt(source)[0].telemetry
  assert.equal(t.kw,-2);assert.equal(t.kvar,-3);assert.equal(t.runtimeHours,1)
  assert.equal(t.voltageNeutral.L1,120);assert.equal(t.startCount,0);assert.equal(t.kwh,0)
})
test('card renders unknowns, explicit zeroes and only real run feedback',async()=>{
  const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom'})
  try {
    const {default:Card}=await server.ssrLoadModule('/src/components/monitoring/pa/MachinePowerCard.jsx')
    const render=device=>renderToStaticMarkup(createElement(Card,{device}))
    const empty=render(adapt(null)[0])
    assert.match(empty,/NO DATA/);assert.doesNotMatch(empty,/RUNNING|0 V|0 A/)
    const source=fixture();source.machines[0].voltage={l1_l2:0};source.machines[0].current={l1:0}
    assert.match(render(adapt(source)[0]),/0 V/);assert.match(render(adapt(source)[0]),/0 A/)
    source.machines[0].run_feedback=true
    assert.match(render(adapt(source)[0]),/RUNNING/)
  } finally {await server.close()}
})
