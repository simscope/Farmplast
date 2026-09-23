import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHmac} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
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
const db = new PGlite({extensions:{pgcrypto}})
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
await db.exec('create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb); alter table storage.objects enable row level security;')
const otaSql=await read('chiller_ota.sql'); await db.exec(otaSql); await db.exec(otaSql)

await db.exec(`create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
grant usage on schema auth,storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;`)
await db.exec(await read('chiller_ota_observability.sql'))
await db.exec(await read('chiller_ota_failure_diagnostics.sql'))
await db.exec(await read('chiller_ota_realtime_wake.sql'))
await db.exec(await read('ch23_edge_free_ota.sql'))
const user='00000000-0000-0000-0000-000000000001',outsider='00000000-0000-0000-0000-000000000099',boot='a'.repeat(32),nextBoot='b'.repeat(32)
const device=n=>'ESP32-CH'+n+'-PLC',id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const hash='c'.repeat(64),key='test-only-key-32-characters-minimum'
await db.query('insert into ch23_ota_private.operators values($1)',[user])
await db.exec("insert into ch23_ota_private.config values(true,'https://test.supabase.co',extensions.crypt('1234',extensions.gen_salt('bf',12)))")
for(const n of [2,3]) await db.query('insert into ch23_ota_private.device_keys values($1,$2)',[device(n),key])
async function asUser(who=user) {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated')}
async function admin() {await db.exec('reset role')}
async function call(fn,args) {return (await db.query(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r}
const unlock=n=>call('chiller_firmware_unlock',[device(n),'1234'])
const payload=(n,version='old',b=boot,job='',status='idle')=>({...oldPayload(n),gateway:{protocol:2,version,boot:b,job,status,progress:status==='idle'?0:99,reset:'software'}})
const tele=(n,...args)=>call('ingest_ch'+n,[JSON.stringify(payload(n,...args))])
const report=(n,job,status,version='old',b=boot,extra={})=>call('chiller_ota_report',[device(n),'test-only-'+n,{...payload(n,version,b,job,status).gateway,...extra}])
let release,job=id(501),signed,expiry
function url(path,seconds=1800) {
 const claims={url:'chiller-firmware/'+path,exp:Math.floor(Date.now()/1000)+seconds}
 return {signed:'https://test.supabase.co/storage/v1/object/sign/chiller-firmware/'+path+'?token='+Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.test',expiry:new Date(claims.exp*1000).toISOString()}
}
const queue=(grant,request=job,releaseId=release,urlValue=signed,expiration=expiry,n=2)=>call('chiller_ota_queue',[device(n),grant,request,releaseId,urlValue,expiration])

test('publication derives auth.uid, restricts operators, validates immutable metadata and verification attestation',async()=>{
 const path=device(2)+'/next/'+hash+'.bin'
 await asUser(outsider)
 await assert.rejects(call('chiller_firmware_publish',[device(2),'next',hash,512,path,hash]),/access denied/)
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('chiller-firmware',$1,'{\"size\":512}')",[path]),/row-level security/)
 await asUser()
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('chiller-firmware',$1,'{\"size\":512}')",[path])
 await assert.rejects(call('chiller_firmware_publish',[device(2),'next',hash,512,path,null]),/unverified/)
 await assert.rejects(call('chiller_firmware_publish',[device(3),'next',hash,512,path,hash]),/Invalid/)
 await assert.rejects(call('chiller_firmware_publish',[device(2),'next',hash,1310721,path,hash]),/Invalid/)
 release=await call('chiller_firmware_publish',[device(2),'next',hash,512,path,hash])
 assert.equal(await call('chiller_firmware_publish',[device(2),'next',hash,512,path,hash]),release)
 await assert.rejects(db.query('insert into chiller_ota_releases(device) values($1)',[device(2)]),/permission denied/)
 await assert.rejects(db.query('select * from ch23_ota_private.config'),/permission denied/)
 assert.equal((await db.query("update storage.objects set metadata='{}' where bucket_id='chiller-firmware' returning id")).rows.length,0)
 assert.equal((await db.query("delete from storage.objects where bucket_id='chiller-firmware' returning id")).rows.length,0)
 await admin()
 assert.equal((await db.query('select operator_id from ch23_ota_private.verifications')).rows[0].operator_id,user)
 ;({signed,expiry}=url(path))
})

test('invalid code attempts commit and rate limiting survives subsequent requests',async()=>{
 await asUser()
 for(let i=0;i<5;i++) assert.equal((await call('chiller_firmware_unlock',[device(2),'9999'])).error,'invalid_code')
 assert.equal((await unlock(2)).error,'rate_limited')
 await admin();assert.equal((await db.query('select attempts from chiller_ota_attempts')).rows[0].attempts,6)
 await db.exec('delete from chiller_ota_attempts')
})

test('legacy telemetry remains compatible; no-job v2 response is compact and wrong-device ingest rejects',async()=>{
 await db.exec('set role anon')
 const old=await call('ingest_ch2',[oldPayload(2)])
 assert.equal(old.ok,true)
 const normal=await tele(2);assert.deepEqual(normal,{o:null});assert.equal(JSON.stringify(normal).length,10)
 await tele(3)
 await assert.rejects(call('ingest_ch2',[payload(3)]),/invalid device credentials/)
 await assert.rejects(call('chiller_ota_report',[device(2),'test-only-3',payload(2).gateway]),/Invalid device credentials/)
 await assert.rejects(db.query('select * from chiller_ota_releases'),/permission denied/)
 await admin()
})

test('configuration origin is Supabase Storage, never the frontend origin',async()=>{
 await admin()
 await assert.rejects(db.query('update ch23_ota_private.config set origin=$1',['https://farmplast.vercel.app']),/check constraint/)
 assert.equal((await db.query('select origin from ch23_ota_private.config')).rows[0].origin,'https://test.supabase.co')
})

test('provisioned bcrypt must use the pgcrypto-compatible 2a format',async()=>{
 await admin()
 const h=(await db.query('select code_hash from ch23_ota_private.config')).rows[0].code_hash
 assert.match(h,/^\$2a\$12\$/)
 assert.equal((await db.query('select extensions.crypt($1,$2)=$2 ok',['1234',h])).rows[0].ok,true)
 // A local bcrypt library can emit 2b, but this pgcrypto runtime does not
 // accept that prefix. Provision a locally generated 2a hash of the same code.
 const incompatible=h.replace(/^\$2a\$/,'$2b$')
 assert.equal((await db.query('select extensions.crypt($1,$2)=$2 ok',['1234',incompatible])).rows[0].ok,false)
})

test('queue bounds URL scope/expiry, atomically consumes grant and is idempotent',async()=>{
 await asUser();const {grant}=await unlock(2)
 assert.equal(grant.length,64)
 await assert.rejects(queue(grant,job,release,signed.replace('https://test.supabase.co','https://farmplast.vercel.app')),/Invalid signed object URL/)
 await assert.rejects(queue(grant,job,release,signed.replace('https://test.supabase.co','https://other.supabase.co')),/Invalid signed object URL/)
 await assert.rejects(queue(grant,job,release,signed.replace('https://test.','https://attacker.')),/Invalid signed/)
 const long=url(device(2)+'/next/'+hash+'.bin',86400)
 await assert.rejects(queue(grant,job,release,long.signed,long.expiry),/expiry/)
 const short=url(device(2)+'/next/'+hash+'.bin',300)
 await assert.rejects(queue(grant,job,release,short.signed,short.expiry),/expiry/)
 assert.equal(await queue(grant),job);assert.equal(await queue(grant),job)
 await assert.rejects(queue(grant,id(502)),/Authorization/)
 await assert.rejects(queue(grant,job,release,signed,expiry,3),/conflict/)
 await admin()
 assert.equal((await db.query('select count(*)::int n from chiller_ota_jobs')).rows[0].n,1)
 assert.equal((await db.query('select used from chiller_ota_grants')).rows[0].used,true)
 assert.equal((await db.query("select count(*)::int n from chiller_ota_events where event='wake_claimed'")).rows[0].n,0)
})

test('next telemetry returns scoped authenticated manifest, URL is HMAC bound, active reports do not fake telemetry',async()=>{
 await db.exec('set role anon')
 assert.equal((await tele(3)).o,null)
 const {o}=await tele(2)
 assert.equal(o.id,job);assert.equal(o.device,device(2));assert.equal(o.url,signed)
 const canonical=[o.id,o.action,o.device,o.model,o.version,o.sha256,o.size,o.expires,o.url].join('|')
 assert.equal(o.mac,createHmac('sha256',key).update(canonical).digest('hex'))
 assert(o.expires<=Math.floor(Date.now()/1000)+600)
 await assert.rejects(report(3,job,'downloading'),/Unknown device job/)
 for(const phase of ['authorized','downloading','verifying','installing','rebooting']) assert.deepEqual(await report(2,job,phase),{o:null})
 await report(2,job,'waiting_for_telemetry','next',nextBoot)
 await admin();assert.equal((await db.query('select status from chiller_ota_jobs where id=$1',[job])).rows[0].status,'waiting_for_telemetry')
 await db.exec('set role anon')
 assert.deepEqual(await tele(2,'next',nextBoot,job,'waiting_for_telemetry'),{o:null,a:'completed'})
 assert.deepEqual(await tele(2,'next',nextBoot,job,'completed'),{o:null,a:'completed'})
 await admin()
})

test('failed job is terminal, precise failure/reset diagnostics survive and telemetry errors do not roll back PLC',async()=>{
 await asUser();const path=device(2)+'/other/'+hash+'.bin'
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('chiller-firmware',$1,'{\"size\":512}')",[path])
 const r=await call('chiller_firmware_publish',[device(2),'other',hash,512,path,hash]);const u=url(path);const {grant}=await unlock(2)
 const next=id(503);await queue(grant,next,r,u.signed,u.expiry)
 await db.exec('set role anon');assert.equal((await tele(2,'next',nextBoot,job,'completed')).o.id,next)
 assert.deepEqual(await report(2,next,'failed','next',nextBoot,{failure_code:'sha256_mismatch',reset:'panic'}),{o:null,a:'failed'})
 assert.equal((await tele(2,'next',nextBoot,next,'failed')).o,null)
 await admin();assert.equal((await db.query('select failure from chiller_ota_jobs where id=$1',[next])).rows[0].failure,'sha256_mismatch')
 const bad=payload(2);bad.gateway.progress='bad';await db.exec('set role anon')
 assert.deepEqual(await call('ingest_ch2',[bad]),{o:null})
 await admin();assert.equal((await db.query("select count(*)::int n from ch2_latest where updated_at>now()-interval '5 seconds'")).rows[0].n,21)
})

test('restrictive Storage boundaries survive broad policies and leave unrelated buckets usable',async()=>{
 await admin()
 await db.exec("create policy unrelated_broad_read on storage.objects for select to anon,authenticated using(true); create policy unrelated_broad_insert on storage.objects for insert to anon,authenticated with check(true); insert into storage.objects(bucket_id,name) values('other-bucket','unrelated.txt')")
 await asUser(outsider)
 assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'other-bucket'}])
 await db.query("select set_config('request.jwt.claim.sub','',false)")
 await db.exec('set role anon')
 assert.deepEqual((await db.query('select bucket_id from storage.objects')).rows,[{bucket_id:'other-bucket'}])
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('chiller-firmware','forbidden.bin')"),/row-level security/)
 await db.query("insert into storage.objects(bucket_id,name) values('other-bucket','still-allowed.txt')")
 await admin()
})
test('legacy service-role sync and queue retain old manifest contract after migration',async()=>{
 await admin()
 await db.exec('set role anon')
 await call('ingest_ch3',[{...oldPayload(3),gateway:{version:'legacy-old',boot,job:''}}])
 await admin()
 await db.query('insert into chiller_ota_grants(token_hash,device,operator_id) values($1,$2,$3)',['legacy-grant',device(3),user])
 const r=id(700),j=id(701)
 await db.query('insert into chiller_ota_releases(id,device,version,model,sha256,size,storage_path,approved) values($1,$2,$3,$4,$5,512,$6,true)',[r,device(3),'legacy-next','CH3-WT32-ETH01-v1',hash,device(3)+'/legacy-next/'+hash+'.bin'])
 // These tables have the original production service_role grants. PGlite's role
 // needs BYPASSRLS just like Supabase's service_role.
 await db.exec('alter role service_role bypassrls; set role service_role')
 await call('chiller_device_sync',[device(3),'legacy-old',boot,null,'idle',0])
 assert.equal(await call('chiller_ota_queue',[user,device(3),'legacy-grant',j,r]),j)
 const old=await call('chiller_device_sync',[device(3),'legacy-old',boot,null,'idle',0])
 assert.equal(old.device,device(3));assert.equal(old.o.id,j);assert.equal(old.o.path,device(3)+'/legacy-next/'+hash+'.bin')
 assert.equal(old.o.action,'update');assert(!('url' in old.o));assert(!('mac' in old.o))
 await admin()
})
test.after(()=>db.close())
