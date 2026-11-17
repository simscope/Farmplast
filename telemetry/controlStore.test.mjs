import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {openControlStore} from './controlStore.mjs'
import {createTelemetryServer} from './server.mjs'
import {createLocalControlHttp,createDownloadTokens,validateStoredImage} from './localControlHttp.mjs'
import {createTelemetryState} from './state.mjs'
import {ch1 as ch1Rows,gateway,plc} from './fixtures.mjs'
const user='00000000-0000-0000-0000-000000000001',unknown='00000000-0000-0000-0000-000000000002'
const secret='synthetic-device-hmac-key-'.repeat(3)
const config={readKey:'1'.repeat(64),devices:{'chiller-1':'2'.repeat(64),'chiller-2':'3'.repeat(64),'chiller-3':'4'.repeat(64),barrels:'5'.repeat(64)},legacyKeys:{'chiller-1':secret,'chiller-2':secret,'chiller-3':secret}}
function imageFor(device='ESP32-CH1',version='ch1-msi-2'){
 const bytes=Buffer.alloc(592);bytes[0]=0xe9;bytes[1]=1;bytes[23]=1;bytes.writeUInt16LE(device==='ESP32-CH1'?9:0,12);bytes.writeUInt32LE(512,28);bytes.writeUInt32LE(0xabcd5432,32)
 const prefix=device==='ESP32-CH1'?'CH1OTA':'CH23OTA'
 bytes.write(`${prefix}_DEVICE=${device}\0${prefix}_VERSION=${version}\0`,64)
 let sum=0xef;for(const b of bytes.subarray(32,544))sum^=b;bytes[559]=sum
 createHash('sha256').update(bytes.subarray(0,560)).digest().copy(bytes,560)
 return bytes
}
const seed=async tx=>{
 const hash=(await tx.query("select extensions.crypt('1234',extensions.gen_salt('bf',12)) h")).rows[0].h
 return {'ch1_private.config':[{singleton:true,origin:'https://farmplast.vercel.app',code_hash:hash,device_key:secret}],
 'ch23_ota_private.config':[{singleton:true,origin:'https://farmplast.vercel.app',code_hash:hash}],
 'ch1_private.operators':[{id:user}],'ch23_ota_private.operators':[{id:user}],
 'ch23_ota_private.device_keys':[{device:'ESP32-CH2-PLC',key:secret},{device:'ESP32-CH3-PLC',key:secret}],
 'public.devices':[{device_code:'ESP32-CH2-PLC',device_secret:secret,is_active:true},{device_code:'ESP32-CH3-PLC',device_secret:secret,is_active:true}],
 'public.ch1_desired_state':[{id:'ESP32-CH1',values:{setpoint:85,d1:2,d2:5,hyst:1,auto:true,fan_enable:false,fan_30:false,fan_60:false},revision:0,reset_sequence:0}],
 'nj_msi_private.routes':[{device:'ESP32-CH1',mode:'relay'},{device:'ESP32-CH2-PLC',mode:'relay'},{device:'ESP32-CH3-PLC',mode:'relay'}]}
}
test('private MSI OTA path verifies bytes, scope, code, HMAC and new-boot telemetry without Cloud',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'farmplast-control-test-'))
 const store=await openControlStore({dataDir:'memory://'},seed)
 const cfg={...config,control:{apiKey:'6'.repeat(64),downloadKey:'7'.repeat(64),firmwareRoot:root}}
 const state=createTelemetryState(),http=createLocalControlHttp(cfg,store,(p,a)=>store.report(p,a))
 const server=createTelemetryServer(cfg,state,(p,b)=>store.exchange(p,b,cfg),http)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const origin='http://127.0.0.1:'+server.address().port
 const headers={Authorization:'Bearer '+cfg.control.apiKey,'X-Operator-ID':user,'Content-Type':'application/json'}
 const rpc=async(name,args={})=>{
  const reply=await fetch(origin+'/v1/control/rpc',{method:'POST',headers,body:JSON.stringify({name,args})})
  assert.equal(reply.status,200);return reply.json()
 }
 try{
  await assert.rejects(store.rpc('ch1_firmware_status',{},unknown),/Operator access/)
  await assert.rejects(store.rpc('nj_msi_exchange',{},user),/Unknown/)
  assert.equal((await fetch(origin+'/v1/control/rpc',{method:'POST',body:'{}'})).status,401)
  const rows=ch1Rows();const m=gateway('ch1-msi-1');m.job='';m.status='idle';m.boot='a'.repeat(32)
  rows.find(r=>r.raw_payload?.gateway).raw_payload.gateway=m
  await store.exchange('chiller-1',{p_rows:rows},cfg)
  const bytes=imageFor(),hash=createHash('sha256').update(bytes).digest('hex')
  const name='ESP32-CH1/ch1-msi-2/'+hash+'.bin',query=new URLSearchParams({bucket:'ch1-firmware',path:name})
  const rejected=Buffer.from(bytes);rejected[90]^=1
  assert.equal((await fetch(origin+'/v1/storage/upload?'+query,{method:'POST',headers,body:rejected})).status,400)
  assert.equal((await fetch(origin+'/v1/storage/upload?'+query,{method:'POST',headers,body:bytes})).status,201)
  assert.deepEqual(Buffer.from(await (await fetch(origin+'/v1/storage/download?'+query,{headers})).arrayBuffer()),bytes)
  const release=await rpc('ch1_firmware_publish',{p_version:'ch1-msi-2',p_sha256:hash,p_size:bytes.length,p_storage_path:name,p_verified_sha256:hash})
  assert.equal((await rpc('ch1_firmware_unlock',{p_code:'0000'})).error,'invalid_code')
  const {grant}=await rpc('ch1_firmware_unlock',{p_code:'1234'})
  const signed=await (await fetch(origin+'/v1/storage/sign?'+query,{method:'POST',headers})).json()
  const url=new URL(signed.signedUrl),token=url.searchParams.get('token'),claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
  const download=new URLSearchParams({bucket:'ch1-firmware',path:name,token})
  assert.equal((await fetch(origin+'/v1/storage/download?'+download)).status,200)
  const bad=new URLSearchParams(download);bad.set('path',name.replace('ch1-msi-2','ch1-msi-3'))
  assert.equal((await fetch(origin+'/v1/storage/download?'+bad)).status,400)
  const job='00000000-0000-0000-0000-000000000003'
  await rpc('ch1_firmware_queue',{p_grant:grant,p_id:job,p_release:release,p_signed_url:signed.signedUrl,p_signed_url_expires_at:new Date(claims.exp*1000).toISOString()})
  const manifest=(await store.exchange('chiller-1',{p_rows:rows},cfg)).o
  const canonical=[manifest.id,'update','CH1-ESP32S3-v1',manifest.version,manifest.sha256,manifest.size,manifest.expires].join('|')
  assert.equal(manifest.mac,createHmac('sha256',secret).update(canonical).digest('hex'))
  const fresh={...m,version:'ch1-msi-2',boot:'b'.repeat(32),job,status:'waiting_for_telemetry',progress:99}
  await store.report('chiller-1',{p_key:secret,p_gateway:fresh})
  assert.notEqual((await rpc('ch1_firmware_status')).jobs[0].status,'completed')
  rows.find(r=>r.raw_payload?.gateway).raw_payload.gateway=fresh
  await store.exchange('chiller-1',{p_rows:rows},cfg)
  assert.equal((await rpc('ch1_firmware_status')).jobs[0].status,'completed')
  const legacy=plc(3);legacy.payload.gateway.version='ch3-msi-1'
  await store.exchange('chiller-3',legacy,cfg)
  const denied=await fetch(origin+'/v1/control/rpc',{method:'POST',headers,body:JSON.stringify({name:'chiller_ota_queue',args:{p_device:'ESP32-CH3-PLC'}})})
  assert.equal(denied.status,409)
  assert.equal((await denied.json()).error,'usb_migration_required')
  assert.equal((await store.db.query("select count(*) n from pg_tables where schemaname='public' and tablename~'(telemetry|latest|points)' ")).rows[0].n,0)
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();await rm(root,{recursive:true,force:true})}
})
test('signed downloads expire and reject other paths or altered signatures',()=>{
 let now=1000000;const tokens=createDownloadTokens('a'.repeat(64),()=>now),token=tokens.issue('b/file')
 assert.equal(tokens.verify(token,'b/file').url,'b/file')
 assert.throws(()=>tokens.verify(token,'b/other'))
 assert.throws(()=>tokens.verify(token.slice(0,-4)+'xxxx','b/file'))
 now+=1800001;assert.throws(()=>tokens.verify(token,'b/file'))
 const bytes=imageFor();validateStoredImage(bytes,{device:'ESP32-CH1',version:'ch1-msi-2',hash:createHash('sha256').update(bytes).digest('hex')})
})
test('CH2/CH3 keep device-bound HMAC, receipt completion and command acknowledgements on MSI',async()=>{
 const store=await openControlStore({dataDir:'memory://'},seed)
 try{
  for(const n of [2,3]){
   const device=`ESP32-CH${n}-PLC`,producer=`chiller-${n}`,body=plc(n)
   body.payload.gateway={...gateway(`ch${n}-msi-1`),boot:'a'.repeat(32)}
   await store.exchange(producer,body,config)
   const name=device+`/ch${n}-msi-2/`+'a'.repeat(64)+'.bin'
   await store.registerObject('chiller-firmware',name,1024)
   const release=await store.rpc('chiller_firmware_publish',{p_device:device,p_version:`ch${n}-msi-2`,p_sha256:'a'.repeat(64),p_size:1024,p_storage_path:name,p_verified_sha256:'a'.repeat(64)},user)
   const {grant}=await store.rpc('chiller_firmware_unlock',{p_device:device,p_code:'1234'},user)
   const token=createDownloadTokens('7'.repeat(64)).issue('chiller-firmware/'+name)
   const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
   const signed='https://farmplast.vercel.app/storage/v1/object/sign/chiller-firmware/'+name+'?token='+token
   const job=`00000000-0000-0000-0000-00000000000${n}`
   await store.rpc('chiller_ota_queue',{p_device:device,p_grant:grant,p_id:job,p_release:release,p_signed_url:signed,p_signed_url_expires_at:new Date(claims.exp*1000).toISOString()},user)
   const manifest=(await store.exchange(producer,body,config)).o
   const canonical=[manifest.id,'update',device,manifest.model,manifest.version,manifest.sha256,manifest.size,manifest.expires,signed].join('|')
   assert.equal(manifest.mac,createHmac('sha256',secret).update(canonical).digest('hex'))
   const next={...body.payload.gateway,version:`ch${n}-msi-2`,boot:'b'.repeat(32),job,status:'waiting_for_telemetry',progress:99}
   await store.report(producer,{p_device:device,p_secret:secret,p_metadata:next})
   assert.notEqual((await store.rpc('chiller_firmware_status',{p_device:device},user)).jobs[0].status,'completed')
   body.payload.gateway=next;await store.exchange(producer,body,config)
   assert.equal((await store.rpc('chiller_firmware_status',{p_device:device},user)).jobs[0].status,'completed')
   assert.throws(()=>store.report(n===2?'chiller-3':'chiller-2',{p_device:device,p_secret:secret,p_metadata:next}),/Wrong device/)
  }
  const rows=ch1Rows(),meta=gateway('ch1-msi-2');rows.find(r=>r.raw_payload?.gateway).raw_payload.gateway=meta
  await store.exchange('chiller-1',{p_rows:rows},config)
  const result=await store.rpc('ch1_command',{p_id:'00000000-0000-0000-0000-000000000009',p_type:'fan_setpoint',p_value:90,p_pin:null},user)
  meta.command_revision=result.command.revision
  await store.exchange('chiller-1',{p_rows:rows},config)
  assert.equal((await store.rpc('ch1_firmware_status',{},user)).commands[0].status,'pending')
  const points=(await import('./points.json',{with:{type:'json'}})).default
  const pid=points.find(p=>p.point_code==='CH1_SETPOINT').point_id
  rows.find(r=>r.point_id===pid).value_number=90
  await store.exchange('chiller-1',{p_rows:rows},config)
  assert.equal((await store.rpc('ch1_firmware_status',{},user)).commands[0].status,'applied')
 }finally{await store.close()}
})
