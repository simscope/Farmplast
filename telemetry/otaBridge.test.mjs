import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createCloudBridge} from './otaBridge.mjs'
import {createTelemetryServer} from './server.mjs'
import {createTelemetryState} from './state.mjs'
import {plc,ch1} from './fixtures.mjs'
const ids=['chiller-1','chiller-2','chiller-3','barrels']
const config={readKey:'r'.repeat(64),devices:Object.fromEntries(ids.map((id,i)=>[id,String(i).repeat(64)])),legacyKeys:Object.fromEntries(ids.slice(0,3).map((id,i)=>[id,`synthetic-legacy-device-secret-${i}`])),cloud:{url:'https://eeobivvwjzakbweluwtm.supabase.co',anonKey:'public-test-key'}}

test('bridge forwards only gateway/control acknowledgements, preserves signed replies and bounds responses',async()=>{
 const calls=[]
 const response={c:[80,3,6,2,true,false,false,false,false],r:7,o:{id:'job',url:'https://private.invalid/signed-test-only',mac:'f'.repeat(64)}}
 const bridge=createCloudBridge(config,async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(response))})
 assert.deepEqual(await bridge('chiller-1',{p_rows:ch1()}),response)
 const request=JSON.parse(calls[0].options.body)
 assert.equal(request.p_device,'ESP32-CH1')
 assert.equal(request.p_key,config.legacyKeys['chiller-1'])
 assert.deepEqual(Object.keys(request.p_reported).sort(),['auto','d1','d2','fan_30','fan_60','fan_enable','hyst','setpoint'])
 assert.equal(/point_id|raw_payload|CDW|CHW|readings/.test(calls[0].options.body),false)
 const payload=plc();payload.payload.gateway.sensor_values=[123,456]
 await bridge('chiller-2',payload)
 assert.deepEqual(JSON.parse(calls[1].options.body).p_reported,{})
 assert.equal(calls[1].options.body.includes('sensor_values'),false)
 assert.equal(calls[1].options.redirect,'error')
 await assert.rejects(createCloudBridge(config,async()=>new Response('x'.repeat(4097)))('chiller-2',plc()),/too large/)
 await assert.rejects(createCloudBridge(config,async()=>new Response('{}',{status:500}))('chiller-2',plc()),/unavailable/)
})
test('mirror never reenters cloud; relay and direct replies require their distinct scoped credentials',async t=>{
 let exchanges=0
 const state=createTelemetryState()
 const server=createTelemetryServer(config,state,async()=>{exchanges++;return {o:null}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}`
 const send=(route,key)=>fetch(`${base}/v1/${route}/chiller-2`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(plc())})
 const legacy=Buffer.from(config.legacyKeys['chiller-2']).toString('base64url')
 assert.equal((await send('mirror',config.devices['chiller-2'])).status,401)
 assert.equal((await send('mirror',legacy)).status,200)
 assert.equal(exchanges,0)
 assert.equal(state.status().devices[1].transport,'mirror')
 assert.deepEqual(await (await send('relay',legacy)).json(),{o:null})
 assert.equal(exchanges,1)
 assert.equal(state.status().devices[1].transport,'relay')
 assert.equal((await send('ingest',legacy)).status,401)
 assert.deepEqual(await (await send('ingest',config.devices['chiller-2'])).json(),{o:null})
 assert.equal(state.status().devices[1].transport,'direct')
 assert.equal(exchanges,2)
})
