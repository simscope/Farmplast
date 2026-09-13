import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createHandler } from '../../supabase/functions/chiller-ota/handler.mjs'
import { sign } from '../../supabase/functions/chiller-ota/protocol.mjs'
import { inspectImage } from '../../firmware/prepare-chiller-release.mjs'

test('release preparation rejects wrong target, version, chip and oversized images', () => {
 const image=Buffer.alloc(512)
 image[0]=0xe9;image.writeUInt32LE(0xabcd5432,32)
 image.write('CH23OTA_VERSION=test-1\0CH23OTA_DEVICE=ESP32-CH2-PLC\0',64)
 const release=inspectImage(image,'ESP32-CH2-PLC','test-1')
 assert.equal(release.approved,false);assert.equal(release.size,512)
 assert.throws(()=>inspectImage(image,'ESP32-CH3-PLC','test-1'),/identity/)
 assert.throws(()=>inspectImage(image,'ESP32-CH2-PLC','test-2'),/identity/)
 const otherChip=Buffer.from(image);otherChip.writeUInt16LE(9,12)
 assert.throws(()=>inspectImage(otherChip,'ESP32-CH2-PLC','test-1'),/classic ESP32/)
 assert.throws(()=>inspectImage(Buffer.alloc(4194304),'ESP32-CH2-PLC','test-1'),/OTA slot/)
})

const read = name => readFile(new URL('../../supabase/' + name, import.meta.url), 'utf8')
const baseline = 'baselines/2026-09-12-ch23/'
const schema = JSON.parse(await read(baseline + 'schema.json'))
const points = JSON.parse(await read(baseline + 'points.json'))
const dependencies = JSON.parse(await read(baseline + 'dependencies.json'))
const migration = await read('compact_ch2_ch3_latest.sql')
const raw = [40023,40024,40025,40051,40052,40056,40057,40061]
const statuses = ['SYSTEM_RUNNING','COMP_1A_ENABLED','COMP_1B_ENABLED','COMP_1C_ENABLED','COMP_2A_ENABLED','COMP_2B_ENABLED','COMP_2C_ENABLED']
const numbers = ['CHILLER_ENTERING_F','CHILLER_LEAVING_F','FLOW_C1_GPM','FLOW_C2_GPM','EVAP_OUT_C1_F','EVAP_OUT_C2_F']
const retained = [...raw.map(r=>'CH2_R'+r), ...statuses.map(p=>'CH2_'+p)].sort()
const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role;
  create table devices(device_code text, device_secret text, is_active boolean);
  create table v_asset_points_latest(asset_code text, point_code text, point_name text, point_group text,
    data_type text, value_boolean boolean, value_number numeric, value_text text, updated_at timestamptz);`)
for (const n of [2,3]) {
  // Column types/nullability/defaults and indexes come from the production catalog snapshot.
  for (const name of [`ch${n}_latest`,`ch${n}_point_map`]) {
    const columns = schema.columns.filter(c=>c.table_name===name).map(c=>
      `${c.column_name} ${c.column_default?.startsWith('nextval') ? 'bigserial' : c.data_type}
      ${c.column_default && !c.column_default.startsWith('nextval') ? 'default '+c.column_default : ''}
      ${c.is_nullable==='NO'?'not null':''}`)
    await db.exec(`create table ${name} (${columns.join(',')});`)
    for (const index of schema.indexes.filter(i=>i.tablename===name)) await db.exec(index.indexdef)
  }
  await db.exec(`alter table ch${n}_latest enable row level security;
    grant select on ch${n}_latest to anon;
    insert into devices values ('ESP32-CH${n}-PLC','test-only-${n}',true);`)
  for (const m of dependencies.mapping.filter(m=>m.source===`ch${n}`)) {
    await db.query(`insert into ch${n}_point_map(asset_code,device_code,point_code,point_name,source_kind,reg_num,bit_index,scale,unit,is_enabled)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [`CH-NJ-0${n}`,`ESP32-CH${n}-PLC`,m.point_code,m.point_name,m.source_kind,m.reg_num,m.bit_index,m.scale,m.unit,m.is_enabled])
  }
  await db.exec(await read(baseline+`ingest_ch${n}.sql`))
  await db.exec(await read(baseline+`v_ch${n}_dashboard.sql`))
}
await db.exec(await read(baseline+'v_nj_monitoring_overview.sql'))
function oldPayload(n) {
  return {device_code:`ESP32-CH${n}-PLC`,device_secret:`test-only-${n}`,readings:points.filter(p=>p.source===`ch${n}_latest`).map(p=>({
    point_code:p.point_code,
    ...(p.raw_register || numbers.some(s=>p.point_code==='CH2_'+s) || /CAPACITY|DELTA/.test(p.point_code)
      ? {value_number:p.raw_register===40023?450:123}
      : {value_boolean:p.point_code!=='CH2_HEARTBEAT'}),
  }))}
}
const ingest = (n,payload) => db.query(`select ingest_ch${n}($1::jsonb) as result`,[JSON.stringify(payload)])


await db.exec(migration)
await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(bucket_id text); alter table storage.objects enable row level security;')
const otaSql=await read('chiller_ota.sql'); await db.exec(otaSql); await db.exec(otaSql)
const user='00000000-0000-0000-0000-000000000001', boot='a'.repeat(32),nextBoot='b'.repeat(32)
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const device=n=>'ESP32-CH'+n+'-PLC'
const sync=async(n,version='old',b=boot,job=null,status='idle')=>(await db.query('select chiller_device_sync($1,$2,$3,$4,$5,50) r',[device(n),version,b,job,status])).rows[0].r
const telemetry=(n,version='old',b=boot,job='')=>ingest(n,{...oldPayload(n),gateway:{version,boot:b,job}})
const grant=(n,token)=>db.query('insert into chiller_ota_grants(token_hash,device,operator_id) values($1,$2,$3)',[token,device(n),user])
const queue=(n,token,job,release)=>db.query('select chiller_ota_queue($1,$2,$3,$4,$5)',[user,device(n),token,job,release])
for(const n of [2,3]) {
 await db.query('insert into chiller_ota_releases(id,device,version,model,sha256,size,storage_path,approved) values($1,$2,$3,$4,$5,1234,$6,true)',[id(n),device(n),'next','CH'+n+'-WT32-ETH01-v1','a'.repeat(64),device(n)+'/next/'+'a'.repeat(64)+'.bin'])
 await telemetry(n); await sync(n)
}

test('device-scoped grants, releases and manifests reject cross-device consumption',async()=>{
 await grant(2,'two'); await grant(3,'three')
 await assert.rejects(queue(3,'two',id(10),id(3)),/Authorization/)
 await assert.rejects(queue(2,'two',id(10),id(3)),/Release unavailable/)
 await queue(2,'two',id(10),id(2)); await queue(2,'two',id(10),id(2))
 await assert.rejects(queue(3,'three',id(10),id(3)),/conflict/)
 await queue(3,'three',id(11),id(3))
 const a=await sync(2),b=await sync(3)
 assert.equal(a.o.device,device(2)); assert.equal(b.o.device,device(3))
 assert.equal(a.o.id,id(10));assert.equal(b.o.id,id(11))
 assert.equal((await sync(2,'old',boot,id(11))).a,null)
 const key='test-only-key-at-least-32-characters'
 assert.notEqual(await sign(a.o,key),await sign({...a.o,device:device(3)},key))
 assert.notEqual(await sign(a.o,key),await sign({...a.o,sha256:'b'.repeat(64)},key))
})

test('new version and boot cannot complete OTA without actual matching telemetry',async()=>{
 for(const [n,job] of [[2,id(10)],[3,id(11)]]) {
  for(const phase of ['authorized','downloading','verifying','installing','rebooting']) await sync(n,'old',boot,job,phase)
  await sync(n,'wrong',nextBoot,job,'waiting_for_telemetry')
  assert.equal((await db.query('select status from chiller_ota_jobs where id=$1',[job])).rows[0].status,'rebooting')
  assert.equal((await sync(n,'next',nextBoot,job,'waiting_for_telemetry')).a,'waiting_for_telemetry')
  await telemetry(n,'next',boot,job)
  assert.equal((await sync(n,'next',nextBoot,job,'waiting_for_telemetry')).a,'waiting_for_telemetry')
  // An empty sensor report cannot overwrite the receipt, even with the right metadata.
  await ingest(n,{...oldPayload(n),readings:[],gateway:{version:'next',boot:nextBoot,job}})
  assert.equal((await sync(n,'next',nextBoot,job,'waiting_for_telemetry')).a,'waiting_for_telemetry')
  await telemetry(n,'next',nextBoot,job)
  assert.equal((await sync(n,'next',nextBoot,job,'waiting_for_telemetry')).a,'completed')
  assert.equal((await db.query(`select count(*)::int n from ch${n}_latest`)).rows[0].n,21)
  assert.equal((await db.query('select count(*)::int n from chiller_ota_receipts where device=$1',[device(n)])).rows[0].n,1)
 }
 await assert.rejects(ingest(2,{...oldPayload(3)}),/invalid device credentials/)
})

test('expired grants, offline devices, timeouts, immutable metadata and storage isolation',async()=>{
 await grant(2,'expired'); await db.query("update chiller_ota_grants set expires_at=now()-interval '1 second' where token_hash='expired'")
 await assert.rejects(queue(2,'expired',id(12),id(2)),/Authorization/)
 await grant(2,'offline'); await db.exec("update chiller_ota_devices set last_seen=now()-interval '5 minutes' where device='ESP32-CH2-PLC'")
 await assert.rejects(queue(2,'offline',id(12),id(2)),/offline/)
 await telemetry(2); await sync(2); await queue(2,'offline',id(12),id(2))
 await db.query("update chiller_ota_jobs set expires_at=now()-interval '1 second' where id=$1",[id(12)])
 assert.equal((await sync(2,'old',boot,id(12),'completed')).a,'failed')
 await assert.rejects(db.query("update chiller_ota_releases set sha256=$1 where id=$2",['b'.repeat(64),id(2)]),/immutable/)
 await db.exec('set role anon')
 await assert.rejects(db.query('select device from chiller_ota_devices'),/permission denied/)
 await assert.rejects(db.query("select chiller_device_sync('ESP32-CH2-PLC','x',$1,null,'idle',0)",[boot]),/permission denied/)
 await db.exec("reset role;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;create policy broad_read on storage.objects for select to authenticated using(true);insert into storage.objects values('chiller-firmware'),('employee-photos');set role authenticated")
 assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'employee-photos'}])
 await db.exec('reset role')
})

test('HTTP authorization rejects untrusted users, bad PIN, rate limits and device impersonation',async()=>{
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-test',CHILLER_OTA_OPERATOR_IDS:user,CHILLER_OTA_OPERATOR_CODE:'1234',CH2_OTA_DEVICE_KEY:'a'.repeat(64),CH3_OTA_DEVICE_KEY:'b'.repeat(64)}
 let identity=null,allowed=true
 const fake={auth:{getUser:async()=>({data:{user:identity},error:null})},rpc:async()=>({data:allowed,error:null}),from:()=>({insert:async()=>({data:null,error:null})})}
 const handler=createHandler(()=>fake,key=>env[key])
 env.CHILLER_OTA_WEB_ORIGIN='https://production.example,https://preview.example'
 for(const origin of ['https://production.example','https://preview.example']) {
  const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{origin},body:JSON.stringify({device:device(2),op:'status'})}))
  assert.equal(response.status,401)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin)
 }
 assert.equal((await handler(new Request('https://test.invalid',{method:'POST',headers:{origin:'https://preview.example.attacker.invalid'},body:'{}'}))).status,403)
 const request=(body,key)=>new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test',...(key?{'x-chiller-device-key':key}:{})},body:JSON.stringify({device:device(2),...body})})
 assert.equal((await handler(request({op:'queue'}))).status,401)
 identity={id:'other'};assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,403)
 identity={id:user};assert.equal((await handler(request({op:'unlock',code:'9999'}))).status,403)
 allowed=false;assert.equal((await handler(request({op:'unlock',code:'1234'}))).status,429)
 assert.equal((await handler(request({op:'sync'},env.CH3_OTA_DEVICE_KEY))).status,401)
 assert.equal((await handler(request({device:device(3),op:'sync'},env.CH2_OTA_DEVICE_KEY))).status,401)
 assert.equal((await handler(request({device:'__proto__',op:'sync'}))).status,400)
 assert.equal((await handler(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(4097)}))).status,413)
})

test('firmware and HMI preserve compact telemetry, device scope and shared polling',async()=>{
 for(const n of [2,3]) {
  const ino=await readFile(new URL(`../../firmware/Chiller${n}/Chiller${n}.ino`,import.meta.url),'utf8')
  assert.match(ino,/POST_INTERVAL_MS\s*=\s*15000UL/)
  assert.match(ino,/Network.setDefaultInterface\(WiFi.STA\)/)
  assert.match(ino,/WiFi.setSleep\(false\)/)
  assert.match(ino,/eth_gateway\s*\(0, 0, 0, 0\)/)
  assert.match(ino,/"Prefer", "return=minimal"/)
  assert.doesNotMatch(ino,/setInsecure|httpUpdate|CH2_HEARTBEAT|CH2_R40053|CH2_R40054|CH2_R40060/)
  assert.deepEqual([...ino.matchAll(/append(?:UInt|Bool)Reading\(body, first, "([^"]+)"/g)].map(m=>m[1]).sort(),retained)
  const page=await readFile(new URL(`../src/pages/Chiller${n}HMIPage.jsx`,import.meta.url),'utf8')
  assert.match(page,/useMonitoringPolling\(loadTelemetry, POLL_MS\)/)
  assert.equal([...page.matchAll(/functions.invoke\('chiller-ota'/g)].length,1)
 }
 const client=await readFile(new URL('../src/components/ChillerProgramming.jsx',import.meta.url),'utf8')
 assert.doesNotMatch(client,/setInterval|setTimeout|SERVICE_ROLE|DEVICE_KEY|7720/)
 assert.match(client,/device:deviceCode/)
 const header=await readFile(new URL('../../firmware/common/ChillerOta.h',import.meta.url),'utf8')
 assert.match(header,/otaHex\(digest,32\)!=job.sha/)
 assert.match(header,/esp_ota_mark_app_invalid_rollback_and_reboot/)
 assert.doesNotMatch(header,/setInsecure|xTaskCreate/)
})
test.after(()=>db.close())
