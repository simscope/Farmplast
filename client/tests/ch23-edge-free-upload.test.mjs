import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {inspectFirmware,sha256,uploadAndApprove,queueFirmware} from '../src/utils/chillerFirmware.js'
const device='ESP32-CH2-PLC'
function file(options={}) {
 const bytes=Buffer.alloc(options.size||512);bytes[0]=0xe9;bytes.writeUInt16LE(options.chip||0,12);bytes.writeUInt32LE(0xabcd5432,32)
 bytes.write(`CH23OTA_VERSION=${options.version||'test'}\0CH23OTA_DEVICE=${options.device||device}\0`,64)
 return new File([bytes],options.name||'Chiller2.bin')
}
test('upload discovers embedded identity, SHA and headroom; rejects wrong type/device/chip/oversize/missing or ambiguous markers',async()=>{
 const f=file(),r=await inspectFirmware(f,device)
 assert.equal(r.device,device);assert.equal(r.version,'test');assert.equal(r.headroom,1310720-512)
 assert.equal(r.sha256,createHash('sha256').update(Buffer.from(await f.arrayBuffer())).digest('hex'))
 assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
 for(const opts of [{name:'x.txt'},{device:'ESP32-CH3-PLC'},{device:'unknown'},{chip:9},{size:1310721},{version:'bad value'},{version:'..'}])
  await assert.rejects(inspectFirmware(file(opts),device))
 const duplicate=Buffer.from(await f.arrayBuffer());duplicate.write('CH23OTA_VERSION=another\0',256)
 await assert.rejects(inspectFirmware(new File([duplicate],'x.bin'),device),/ambiguous/)
})
test('approval cannot precede authenticated stored-byte readback; corrupt/missing storage and conflicting versions never approve',async()=>{
 for(const mode of ['good','corrupt','missing','conflict','upload-error']) {
  const events=[],f=file(),meta=await inspectFirmware(f,device)
  const bucket={upload:async(path,bytes,opts)=>{events.push('upload');assert.equal(opts.upsert,false);assert.equal(path,meta.storage_path);return {error:mode==='upload-error'?{statusCode:'403'}:null}},
   download:async()=>{events.push('readback');return {error:mode==='missing'?{}:null,data:mode==='corrupt'?file({version:'other'}):f}}}
  const client={storage:{from:()=>bucket},rpc:async(name,args)=>{
   if(name==='chiller_firmware_status') return {data:{releases:mode==='conflict'?[{version:'test',sha256:'wrong',size:512}]:[]}}
   events.push('approve');assert.equal(args.p_verified_sha256,meta.sha256);assert.deepEqual(events,['upload','readback','approve']);return {data:'release'}
  }}
  if(mode==='good') assert.equal(await uploadAndApprove(client,f,device,meta),'release')
  else {await assert.rejects(uploadAndApprove(client,f,device,meta));assert(!events.includes('approve'))}
 }
})
test('program flow uses unlock then fresh 30-minute object URL then idempotent queue without arbitrary operator UUID',async()=>{
 const events=[],path=device+'/test/'+'a'.repeat(64)+'.bin',expires=Math.floor(Date.now()/1000)+1800
 const signed='https://test.supabase.co/storage/v1/object/sign/chiller-firmware/'+path+'?token=a.'+Buffer.from(JSON.stringify({exp:expires})).toString('base64url')+'.sig'
 const client={storage:{from:()=>({createSignedUrl:async(p,s)=>{assert.equal(p,path);assert.equal(s,1800);events.push('sign');return {data:{signedUrl:signed}}}})},rpc:async(name,args)=>{
  assert(!('p_user' in args));events.push(name)
  if(name==='chiller_firmware_unlock') return {data:{grant:'token'}}
  assert.equal(args.p_signed_url_expires_at,new Date(expires*1000).toISOString());assert.equal(args.p_id,'request');return {data:'job'}
 }}
 assert.equal(await queueFirmware(client,{device,code:'1234',release:{id:'release',storage_path:path},requestId:'request'}),'job')
 assert.deepEqual(events,['chiller_firmware_unlock','sign','chiller_ota_queue'])
})
test('new firmware and UI have no Edge/WSS/extra idle scheduler; telemetry and PLC cadence preserved',async()=>{
 const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
 const common=await read('firmware/common/ChillerOta.h')
 for(const n of [2,3]) {
  const ino=await read(`firmware/Chiller${n}/Chiller${n}.ino`)
  assert.doesNotMatch(ino+common,/chiller-ota|WebSockets|ChillerOtaRealtime|xTaskCreate|otaWake|otaSchedule/)
  assert.match(ino,/POST_INTERVAL_MS\s*=\s*15000UL/);assert.match(ino,/POLL_INTERVAL_MS\s*=\s*2000UL/)
  const service=ino.slice(ino.indexOf('void serviceOta()'),ino.indexOf('// SETUP'))
  assert.doesNotMatch(service,/http|SyncDue|ReportOta/)
 }
 for(const path of ['client/src/components/ChillerProgramming.jsx','client/src/hooks/useOtaStatus.js','client/src/utils/chillerFirmware.js'])
  assert.doesNotMatch(await read(path),/chiller-ota|functions.invoke|SERVICE_ROLE|DEVICE_KEY/)
 assert.match(common,/String\(\(long long\)job.expires\)\+"\|"\+job.url/)
})
