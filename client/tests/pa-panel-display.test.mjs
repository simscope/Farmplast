import test from 'node:test'
import assert from 'node:assert/strict'
import { siloDisplay, mixerDisplay } from '../src/components/monitoring/pa/panelDisplay.js'
import { adaptPaSnapshot } from '../src/components/monitoring/pa/snapshot.js'

test('panel display follows exact HMI level boundaries without inventing alarms', () => {
  for (const [level,status,color] of [[0,'LOW','#E0B223'],[20,'LOW','#E0B223'],[21,'NORMAL','#2E8B57'],[80,'NORMAL','#2E8B57'],[81,'HIGH / FULL','#C2412D'],[100,'HIGH / FULL','#C2412D']]) {
    const result=siloDisplay({connection:'ONLINE',telemetry:{sensorStatus:'ONLINE',levelPercent:level,rawValue:0}})
    assert.equal(result.status,status); assert.equal(result.color,color); assert.equal(result.raw,0); assert.equal(result.alarm,null)
  }
})
test('unknown, stale and test readings cannot resemble current material or running equipment', () => {
  const plant=adaptPaSnapshot(null)
  assert.equal(siloDisplay(plant.barrels[0]).level,null)
  assert.equal(mixerDisplay(plant.mixers[0]).status,'NO DATA')
  for(const connection of ['STALE','TEST MODE','NOT CONFIGURED']) {
    const device={connection,telemetry:{sensorStatus:'ONLINE',levelPercent:50,rawValue:123,operation:'RUNNING',fault:true}}
    assert.equal(siloDisplay(device).level,null);assert.equal(siloDisplay(device).raw,'—');assert.equal(siloDisplay(device).alarm,null)
    assert.equal(mixerDisplay(device).status,'NO DATA');assert.equal(mixerDisplay(device).alarm,'—')
  }
})
test('mixer display uses feedback, never a start request or a default ready state', () => {
  assert.equal(mixerDisplay({connection:'ONLINE',telemetry:{commandedState:'START'}}).status,'NO DATA')
  assert.equal(mixerDisplay({connection:'ONLINE',telemetry:{operation:'STOPPED',fault:false}}).status,'STOPPED')
  assert.equal(mixerDisplay({connection:'ONLINE',telemetry:{operation:'RUNNING',fault:true}}).alarm,'FAULT')
})
