import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
import {inspectFirmware} from '../src/utils/ch1Firmware.js'
const file=p=>readFile(new URL('../../'+p,import.meta.url),'utf8')
const ino=await file('firmware/Chiller1/Chiller1.ino')
const header=await file('firmware/Chiller1/Ch1Ota.h')
const points=[...ino.matchAll(/const char\* PID_(\w+)\s*= "([0-9a-f-]+)"/g)].map(m=>({code:m[1],id:m[2]}))
const uid='00000000-0000-0000-0000-000000000001',id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const key='test-only-CH1-device-key-32-characters',boot='a'.repeat(32),next='b'.repeat(32),sha='c'.repeat(64)

test('CH1 direct RPC authorization, control reconciliation, RESET, OTA and legacy compatibility',async()=>{
 const db=new PGlite({extensions:{pgcrypto}})
 const call=async(fn,args=[]) => (await db.query(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map((v,i)=>fn==='ch1_command'&&i===2?JSON.stringify(v):v))).rows[0].r
 const admin=()=>db.exec('reset role')
 const user=async(who=uid)=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated')}
 const gateway=(version='ch1-ota-2',b=boot,job='',status='idle',revision=0,reset=0)=>({protocol:2,version,boot:b,job,status,progress:status==='idle'?0:99,command_revision:revision,reset_sequence:reset})
 const payload=(m= gateway(),actual={})=>points.map(p=>({point_id:p.id,asset_id:'4327afc7-a56b-4253-97c9-3de3632fb189',device_id:'db7a7808-8ceb-407a-bfbf-c215e42ffb93',value_number:typeof actual[p.code]==='number'?actual[p.code]:null,value_boolean:typeof actual[p.code]==='boolean'?actual[p.code]:p.code==='CH1_AUTO'?true:p.code==='CH1_ONLINE'?true:null,quality:'good',raw_payload:{...(p.code==='CH1_ONLINE'?{gateway:m}:{}),device_code:'ESP32-CH1'}}))
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema extensions;create extension pgcrypto with schema extensions;
   create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_user::text$$;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;
   create table telemetry_latest(point_id uuid primary key,asset_id uuid not null,device_id uuid,value_number double precision,value_boolean boolean,value_text text,quality text,source_timestamp timestamptz,updated_at timestamptz,raw_payload jsonb);
   create table point_map(point_id uuid,point_code text);
   create view v_asset_points_latest as select m.point_id,m.point_code,'CH-NJ-01'::text asset_code,t.value_number,t.value_boolean from point_map m left join telemetry_latest t using(point_id);
   grant usage on schema auth,storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`)
  for(const p of points)await db.query('insert into point_map values($1,$2)',[p.id,p.code])
  await db.exec(await file('supabase/ch1_ota.sql'))
  await db.exec(await file('supabase/ch1_edge_free.sql'))
  await db.query('insert into ch1_private.operators values($1)',[uid])
  await db.query("insert into ch1_private.config values(true,'https://test.supabase.co',extensions.crypt('1234',extensions.gen_salt('bf',12)),$1)",[key])
  await db.exec('set role anon')
  await assert.rejects(call('ingest_ch1',['wrong',payload()]),/authentication/)
  await assert.rejects(call('ingest_ch1',[key,payload().map(r=>({...r,asset_id:id(999)}))]),/target/)
  let r=await call('ingest_ch1',[key,payload()]);assert.deepEqual(r.c,[85,2,5,1,true,false,false,false,false]);assert.equal(r.r,0)
  await assert.rejects(call('ch1_firmware_status'),/permission|access/i)
  await user(id(99));await assert.rejects(call('ch1_firmware_status'),/access/i)
  await user();const c=await call('ch1_command',[id(2),'fan_setpoint',90,null]);assert.equal(c.command.status,'pending')
  assert.equal((await call('ch1_command',[id(2),'fan_setpoint',90,null])).command.revision,1)
  await assert.rejects(call('ch1_command',[id(2),'fan_setpoint',91,null]),/conflict/)
  await assert.rejects(call('ch1_command',[id(3),'fan_off',null,null]),/pending/)
  assert.equal((await call('ch1_firmware_status')).commands[0].status,'pending')
  await db.exec('reset role;set role anon')
  await call('ingest_ch1',[key,payload(gateway('ch1-ota-2',boot,'','idle',1),{CH1_SETPOINT:85})])
  await user();assert.equal((await call('ch1_firmware_status')).commands[0].status,'pending')
  await db.exec('reset role;set role anon');r=await call('ingest_ch1',[key,payload(gateway('ch1-ota-2',boot,'','idle',1),{CH1_SETPOINT:90})]);assert.equal(r.r,1)
  await user();assert.equal((await call('ch1_firmware_status')).commands[0].status,'applied')
  assert.equal((await call('ch1_command',[id(4),'reset_alert',null,'0000'])).error,'invalid_code')
  for(const n of [1,2]) {
   const reset=await call('ch1_command',[id(10+n),'reset_alert',null,'1234']);assert.equal(reset.command.reset_sequence,n)
   await db.exec('reset role;set role anon');r=await call('ingest_ch1',[key,payload(gateway('ch1-ota-2',boot,'','idle',reset.command.revision,n-1),{CH1_SETPOINT:90})]);assert.equal(r.q,n)
   await call('ingest_ch1',[key,payload(gateway('ch1-ota-2',boot,'','idle',reset.command.revision,n),{CH1_SETPOINT:90})]);await user();assert.equal((await call('ch1_firmware_status')).commands[0].status,'applied')
  }
  await admin();await db.exec("update ch1_ota_device set last_seen=now()-interval '1 minute'");await user();await assert.rejects(call('ch1_command',[id(20),'fan_off',null,null]),/offline/)
  await admin();await call('ch1_device_sync',['ch1-ota-2',boot,null,'idle',0]); // Old firmware remains supported.
  let commandId=100,previousRevision=3
  for(const [type,value,expected] of [['fan_mode','manual',{auto:false}],['fan_speed',30,{auto:false,fan_enable:true,fan_30:true,fan_60:false}],['fan_speed',60,{auto:false,fan_enable:true,fan_30:false,fan_60:true}],['fan_off',null,{auto:false,fan_enable:false,fan_30:false,fan_60:false}],['fan_mode','auto',{auto:true}],['d1',3,{d1:3}],['d2',6,{d2:6}],['hyst',2,{hyst:2}]]) {
   await user();const {command}=await call('ch1_command',[id(commandId++),type,value,null]);assert.deepEqual(command.requested,expected);assert.equal(command.revision,++previousRevision)
   assert.equal((await call('ch1_firmware_status')).commands[0].status,'pending')
   await db.exec('reset role;set role anon');await call('ingest_ch1',[key,payload(gateway('ch1-ota-2',boot,'','idle',command.revision,2),Object.fromEntries(Object.entries(expected).map(([k,v])=>['CH1_'+k.toUpperCase(),v])))])
   await user();assert.equal((await call('ch1_firmware_status')).commands[0].status,'applied')
  }
  await assert.rejects(call('ch1_command',[id(200),'fan_speed',45,null]),/Invalid/)
  await assert.rejects(call('ch1_command',[id(201),'fan_setpoint','NaN',null]),/Invalid/)
  await admin()
  const path='ESP32-CH1/ch1-edgefree-test/'+sha+'.bin';await db.query("insert into storage.objects(bucket_id,name,metadata) values('ch1-firmware',$1,'{\"size\":1000}')",[path])
  await db.exec("create policy unrelated_broad_storage on storage.objects for all to authenticated using(true) with check(true)")
  await user(id(99));assert.equal((await db.query("select * from storage.objects where bucket_id='ch1-firmware'")).rows.length,0)
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('ch1-firmware','bad.bin')"),/policy/)
  await user();assert.equal((await db.query("select * from storage.objects where bucket_id='ch1-firmware'")).rows.length,1)
  assert.equal((await db.query("update storage.objects set name='changed' where bucket_id='ch1-firmware' returning id")).rows.length,0)
  assert.equal((await db.query("delete from storage.objects where bucket_id='ch1-firmware' returning id")).rows.length,0)
  await user();const release=await call('ch1_firmware_publish',['ch1-edgefree-test',sha,1000,path,sha])
  const {grant}=await call('ch1_firmware_unlock',['1234']);assert.ok(grant)
  await admin();assert.equal((await db.query('select token_hash=$1 plain from ch1_ota_grants',[grant])).rows[0].plain,false);await user()
  const exp=Math.floor(Date.now()/1000)+1800,token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({url:'ch1-firmware/'+path,exp})).toString('base64url')+'.test'
  const url='https://test.supabase.co/storage/v1/object/sign/ch1-firmware/'+path+'?token='+token
  const args=[grant,id(30),release,url,new Date(exp*1000).toISOString()]
  await assert.rejects(call('ch1_firmware_queue',[...args.slice(0,3),url.replace('test.supabase.co','farmplast.vercel.app'),args[4]]),/URL/)
  assert.equal(await call('ch1_firmware_queue',args),id(30));assert.equal(await call('ch1_firmware_queue',args),id(30))
  await db.exec('reset role;set role anon');r=await call('ingest_ch1',[key,payload()]);assert.equal(r.o.url,url)
  const m=r.o;assert.equal(m.mac,createHmac('sha256',key).update([m.id,'update',m.model,m.version,m.sha256,m.size,m.expires].join('|')).digest('hex'))
  for(const status of ['authorized','downloading','verifying','installing','rebooting'])await call('ch1_ota_report',[key,gateway('ch1-ota-2',boot,id(30),status)])
  r=await call('ch1_ota_report',[key,gateway('ch1-edgefree-test',next,id(30),'waiting_for_telemetry')]);assert.notEqual(r.a,'completed')
  r=await call('ingest_ch1',[key,payload(gateway('ch1-edgefree-test',next,id(30),'waiting_for_telemetry'))]);assert.equal(r.a,'completed')
  await user();assert.equal((await call('ch1_firmware_status')).device.protocol,2)
  await assert.rejects(call('ch1_ota_report',[key,gateway()]),/Unknown job/)
 } finally {await db.close()}
})

test('CH1 S3 upload rejects classic ESP32, foreign models and insufficient slot margin',async()=>{
 const make=(chip=9,model='CH1-ESP32S3-v1',size=1024)=>{const b=Buffer.alloc(size);b[0]=0xe9;b.writeUInt16LE(chip,12);b.writeUInt32LE(0xabcd5432,32);b.write('CH1OTA_DEVICE=ESP32-CH1\0CH1OTA_MODEL='+model+'\0CH1OTA_VERSION=ch1-edgefree-test\0',80);return new File([b],'app.bin')}
 assert.equal((await inspectFirmware(make(),'ESP32-CH1')).version,'ch1-edgefree-test')
 await assert.rejects(inspectFirmware(make(0),'ESP32-CH1'),/S3/)
 await assert.rejects(inspectFirmware(make(9,'CH2-WT32-ETH01-v1'),'ESP32-CH1'),/model/)
 await assert.rejects(inspectFirmware(make(9,undefined,1245185),'ESP32-CH1'),/slot/)
 await assert.rejects(inspectFirmware(make(),'ESP32-CH3-PLC'),/target/)
})

test('CH1 transport has no idle fetch or Edge/WSS dependency and retains rollback/reset',()=>{
 assert.doesNotMatch(ino+header,/functions\/v1|WebSocketsClient|realtime\/v1|CLOUD_FETCH_MS|lastCloudFetchAt|setInsecure/)
 assert.match(ino,/RESET_PULSE_MS\s*= 10000/)
 assert.match(header,/revision>ch1CommandRevision/)
 assert.match(header,/esp_ota_mark_app_invalid_rollback_and_reboot/)
 assert.match(header,/esp_ota_get_next_update_partition/)
 assert.match(header,/setCACert/)
})
