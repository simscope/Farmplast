import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { canonical, sign, equalSecret, validQueue } from '../../supabase/functions/ch1-ota/protocol.mjs'
import { createHandler } from '../../supabase/functions/ch1-ota/handler.mjs'
import { commandPatch } from '../../supabase/functions/ch1-ota/commands.mjs'
import { commandOutcome } from '../src/utils/ch1CommandState.mjs'
const user='00000000-0000-0000-0000-000000000001',release='00000000-0000-0000-0000-000000000002',job='00000000-0000-0000-0000-000000000003'
const boot='a'.repeat(32),nextBoot='b'.repeat(32)
const codes=['CH1_SETPOINT','CH1_D1','CH1_D2','CH1_HYST','CH1_AUTO','CH1_FAN_ENABLE','CH1_FAN_30','CH1_FAN_60','CH1_RESET']
test('control commands require matching reported state; reset sequences are repeatable',async()=>{
 const db=await setup(); let sequence=10
 const fields={setpoint:'CH1_SETPOINT',d1:'CH1_D1',d2:'CH1_D2',hyst:'CH1_HYST',auto:'CH1_AUTO',fan_enable:'CH1_FAN_ENABLE',fan_30:'CH1_FAN_30',fan_60:'CH1_FAN_60'}
 try {
  for(const [type,value,expected] of [
   ['fan_mode','manual',{auto:false}],['fan_speed',30,{auto:false,fan_enable:true,fan_30:true,fan_60:false}],
   ['fan_speed',60,{auto:false,fan_enable:true,fan_30:false,fan_60:true}],['fan_off',null,{auto:false,fan_enable:false,fan_30:false,fan_60:false}],
   ['fan_mode','auto',{auto:true}],['fan_setpoint',90,{setpoint:90}],['d1',3,{d1:3}],['d2',6,{d2:6}],['hyst',2,{hyst:2}],
   ['reset_alert',null,{reset:true}],['reset_alert',null,{reset:true}]
  ]) {
   const patch=commandPatch(type,value);assert.deepEqual(patch,expected)
   const id='00000000-0000-0000-0000-'+String(sequence++).padStart(12,'0')
   const pending=(await db.query('select public.ch1_control_request($1,$2,$3,$4) c',[user,id,type,JSON.stringify(patch)])).rows[0].c
   assert.equal(commandOutcome(pending,[pending]),'pending')
   await db.query('select public.ch1_control_reconcile()')
   assert.equal((await db.query('select status from public.ch1_control_commands where id=$1',[id])).rows[0].status,'pending')
   const sync=(await db.query("select public.ch1_device_sync('test-0',$1,null,'idle',0) j",[boot])).rows[0].j
   assert.equal(sync.r,pending.revision);assert.equal(sync.c[8],false)
   if(type==='reset_alert') assert.equal(sync.q,pending.reset_sequence)
   for(const [key,val] of Object.entries(patch)) if(fields[key]) await db.query('update public.v_asset_points_latest set value_number=$1,value_boolean=$2 where asset_code=$3 and point_code=$4',[typeof val==='number'?val:null,typeof val==='boolean'?val:null,'CH-NJ-01',fields[key]])
   await db.query("insert into public.telemetry_latest values('111996e4-ff83-4ad7-b4cd-233d326a30f7','db7a7808-8ceb-407a-bfbf-c215e42ffb93',$1) on conflict(point_id) do update set raw_payload=excluded.raw_payload",[JSON.stringify({gateway:{command_revision:pending.revision,reset_sequence:pending.reset_sequence}})])
   await db.query('select public.ch1_control_reconcile()')
   const observed=(await db.query('select * from public.ch1_control_commands where id=$1',[id])).rows[0]
   assert.equal(commandOutcome(pending,[observed]),'applied')
  }
  assert.equal((await db.query('select reset_sequence from public.ch1_desired_state')).rows[0].reset_sequence,2)
  await db.query("update public.ch1_ota_device set last_seen=now()-interval '5 minutes'")
  await assert.rejects(db.query("select public.ch1_control_request($1,$2,'fan_off',$3)",[user,job,JSON.stringify(commandPatch('fan_off'))]),/offline/)
  assert.equal(commandOutcome({id:job,expires_at:new Date(0).toISOString()},[]),'timeout')
  assert.throws(()=>commandPatch('d1',-1));assert.throws(()=>commandPatch('fan_speed',45))
 } finally {await db.close()}
})
async function setup() {
  const db=new PGlite()
  await db.exec('create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(bucket_id text); alter table storage.objects enable row level security; create table public.v_asset_points_latest(asset_code text,point_code text,value_number numeric,value_boolean boolean); create table public.telemetry_latest(point_id uuid primary key,device_id uuid,raw_payload jsonb);')
  const sql=await readFile(new URL('../../supabase/ch1_ota.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql)
  for(let i=0;i<9;i++) await db.query('insert into public.v_asset_points_latest values($1,$2,$3,$4)',['CH-NJ-01',codes[i],i<4?i+1:null,i>=4?i%2===0:null])
  await db.query("insert into public.v_asset_points_latest values('CH-NJ-01','CH1_CDW_OUT',999,null),('CH-NJ-02','CH1_SETPOINT',999,null)")
  await db.query("insert into public.ch1_ota_releases(id,version,sha256,size,storage_path,approved) values($1,'test-1',$2,1234,'test.bin',true)",[release,'a'.repeat(64)])
  await db.query("select public.ch1_device_sync('test-0',$1,null,'idle',0)",[boot])
  await db.query("insert into public.ch1_ota_grants(token_hash,operator_id) values('good',$1)",[user])
  return db
}

test('missing numeric telemetry and malformed acknowledgements cannot confirm commands',async()=>{
 const db=await setup()
 try {
  await db.query("select public.ch1_control_request($1,$2,'fan_setpoint','{\"setpoint\":90}')",[user,job])
  await db.query("update public.v_asset_points_latest set value_number=null where point_code='CH1_SETPOINT'")
  await db.query("insert into public.telemetry_latest values('111996e4-ff83-4ad7-b4cd-233d326a30f7','db7a7808-8ceb-407a-bfbf-c215e42ffb93','{\"gateway\":{\"command_revision\":1}}')")
  await db.query('select public.ch1_control_reconcile()')
  assert.equal((await db.query('select status from public.ch1_control_commands')).rows[0].status,'pending')
  await db.query("update public.telemetry_latest set raw_payload='{\"gateway\":{\"command_revision\":\"invalid\"}}'")
  await db.query('select public.ch1_control_reconcile()')
  await db.query("update public.ch1_control_commands set expires_at=now()-interval '1 second'")
  await db.query('select public.ch1_control_reconcile()')
  assert.equal((await db.query('select status from public.ch1_control_commands')).rows[0].status,'timeout')
 } finally {await db.close()}
})
test('manifest authentication and authorization are independent from equipment state',async()=>{
  const manifest={id:job,action:'update',model:'CH1-ESP32S3-v1',version:'test-1',sha256:'a'.repeat(64),size:1234,expires:1234567}
  const key='test-only-device-key-with-32-characters',mac=await sign(manifest,key)
  assert.equal(mac,createHmac('sha256',key).update(canonical(manifest)).digest('hex'))
  for(const field of Object.keys(manifest)) assert.notEqual(await sign({...manifest,[field]:String(manifest[field])+'x'},key),mac)
  assert.equal(await equalSecret('1234','1234'),true);assert.equal(await equalSecret('1234','9999'),false)
  assert.equal(validQueue({action:'update',id:job,release}),true)
  assert.equal(validQueue({action:'resume',id:job,release}),false)
})
test('one compact exchange, full lifecycle, real new-boot telemetry proof and audit',async()=>{
  const db=await setup();const q=(sql,p=[])=>db.query(sql,p)
  try {
    for(let i=1;i<=6;i++) assert.equal((await q('select public.ch1_ota_attempt($1) allowed',[user])).rows[0].allowed,i<=5)
    await assert.rejects(q("update public.ch1_ota_releases set size=999 where id=$1",[release]),/immutable/)
    await assert.rejects(q("select public.ch1_ota_queue($1,'bad',$2,$3)",[user,job,release]),/Authorization expired/)
    await q("select public.ch1_ota_queue($1,'good',$2,$3)",[user,job,release]);await q("select public.ch1_ota_queue($1,'good',$2,$3)",[user,job,release])
    assert.equal((await q('select count(*)::int n from public.ch1_ota_jobs')).rows[0].n,1)
    await q("insert into public.ch1_ota_grants(token_hash,operator_id) values('second',$1)",[user])
    await assert.rejects(q("select public.ch1_ota_queue($1,'second','00000000-0000-0000-0000-000000000004',$2)",[user,release]),/already active/)
    const first=(await q("select public.ch1_device_sync('test-0',$1,null,'idle',0) j",[boot])).rows[0].j
    assert.deepEqual(first.c,[85,2,5,1,true,false,false,false,false]);assert.equal(first.o.id,job)
    for(const state of ['authorized','downloading','verifying','installing','rebooting']) await q("select public.ch1_device_sync('test-0',$1,$2,$3,50)",[boot,job,state])
    await q("select public.ch1_device_sync('test-0',$1,$2,'downloading',0)",[boot,job])
    assert.equal((await q('select status from public.ch1_ota_jobs')).rows[0].status,'rebooting')
    await q("select public.ch1_device_sync('test-1',$1,$2,'waiting_for_telemetry',99)",[nextBoot,job])
    assert.equal((await q('select status from public.ch1_ota_jobs')).rows[0].status,'waiting_for_telemetry')
    const writeTelemetry=async b=>q("insert into public.telemetry_latest values('111996e4-ff83-4ad7-b4cd-233d326a30f7','db7a7808-8ceb-407a-bfbf-c215e42ffb93',$1) on conflict(point_id) do update set raw_payload=excluded.raw_payload",[JSON.stringify({gateway:{version:'test-1',boot:b,job}})])
    await writeTelemetry(boot)
    await q("select public.ch1_device_sync('test-1',$1,$2,'waiting_for_telemetry',99)",[nextBoot,job])
    assert.equal((await q('select status from public.ch1_ota_jobs')).rows[0].status,'waiting_for_telemetry')
    await writeTelemetry(nextBoot)
    const complete=(await q("select public.ch1_device_sync('test-1',$1,$2,'waiting_for_telemetry',99) j",[nextBoot,job])).rows[0].j
    assert.equal(complete.a,'completed');assert.equal(complete.o,null)
    assert.deepEqual((await q('select event from public.ch1_ota_events where job_id=$1 order by id',[job])).rows.map(x=>x.event),['authorized','downloading','verifying','installing','rebooting','waiting_for_telemetry','completed'])
    await db.exec('set role anon')
    await assert.rejects(q('select * from public.ch1_ota_releases'),/permission denied/)
    await assert.rejects(q("select public.ch1_device_sync('x',$1,null,'idle',0)",[boot]),/permission denied/)
    await db.exec("reset role; grant usage on schema storage to authenticated; grant select on storage.objects to authenticated; create policy broad_existing_read on storage.objects for select to authenticated using(true); insert into storage.objects values('ch1-firmware'),('employee-photos'); set role authenticated;")
    assert.deepEqual((await q('select bucket_id from storage.objects')).rows,[{bucket_id:'employee-photos'}])
  } finally {await db.close()}
})
test('expired authorization and failed updates cannot be replayed',async()=>{
  const db=await setup()
  try {
    await db.query("update public.ch1_ota_grants set expires_at=now()-interval '1 second'")
    await assert.rejects(db.query("select public.ch1_ota_queue($1,'good',$2,$3)",[user,job,release]),/expired/)
    await db.query("update public.ch1_ota_grants set expires_at=now()+interval '5 minutes'")
    await db.query("select public.ch1_ota_queue($1,'good',$2,$3)",[user,job,release])
    await db.query("update public.ch1_ota_jobs set expires_at=now()-interval '1 second'")
    const reply=(await db.query("select public.ch1_device_sync('test-0',$1,$2,'idle',0) j",[boot,job])).rows[0].j
    assert.equal(reply.a,'failed');assert.equal(reply.o,null)
  } finally {await db.close()}
})
test('HTTP endpoint rejects unauthorized users, wrong code and device impersonation',async()=>{
  const secrets={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',CH1_OTA_OPERATOR_IDS:user,CH1_OTA_OPERATOR_CODE:'1234',CH1_OTA_DEVICE_KEY:'test-device-key-at-least-32-characters'}
  let identity=null,allowAttempt=true,calls=[]
  const db={auth:{getUser:async()=>({data:{user:identity},error:null})},rpc:async name=>{calls.push(name);return{data:allowAttempt,error:null}},from:()=>({insert:async()=>({data:null,error:null})})}
  const handler=createHandler(()=>db,key=>secrets[key])
  const request=body=>new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify(body)})
  assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,401)
  identity={id:'other',user_metadata:{role:'admin'}};assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,403);assert.deepEqual(calls,[])
  identity={id:user};assert.equal((await handler(request({op:'unlock',code:'9999'}))).status,403)
  allowAttempt=false;assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,429)
  assert.equal((await handler(request({op:'sync',version:'test',boot,status:'idle',progress:0}))).status,401)
  delete secrets.CH1_OTA_OPERATOR_CODE;allowAttempt=true;assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,503)
  assert.equal((await handler(new Request('https://example.test',{method:'POST',body:'x'.repeat(4097)}))).status,413)
})
test('gateway OTA has no second polling task or output interlock',async()=>{
  const source=await readFile(new URL('../../firmware/Chiller1/Ch1Ota.h',import.meta.url),'utf8')
  assert.doesNotMatch(source,/xTaskCreate|vTaskDelay|relayWrite|otaFreshControls|ch1Maintenance/)
  assert.match(source,/ch1DeviceSync\(true\)/)
  assert.match(source,/esp_ota_mark_app_valid_cancel_rollback/)
  assert.match(source,/esp_ota_mark_app_invalid_rollback_and_reboot/)
  const sketch=await readFile(new URL('../../firmware/Chiller1/Chiller1.ino',import.meta.url),'utf8')
  assert.match(source,/\/rest\/v1\/rpc\/ingest_ch1/)
  assert.doesNotMatch(sketch,/lastCloudFetchAt/)
  const payload=sketch.slice(sketch.indexOf('String buildTelemetryLatestPayload()'),sketch.indexOf('bool pushTelemetry()'))
  assert.equal([...payload.matchAll(/appendLatest(?:Number|Bool)\(rows,/g)].length,19)
})
