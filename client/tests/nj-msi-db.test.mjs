import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { gateway } from '../../telemetry/fixtures.mjs'
import metadata from '../../telemetry/points.json' with {type:'json'}

const read = async path => (await readFile(new URL('../../'+path,import.meta.url),'utf8')).replace(/\r\n/g,'\n')
const key='synthetic-device-key-for-private-tests', user='00000000-0000-0000-0000-000000000001'
const release='00000000-0000-0000-0000-000000000002', job='00000000-0000-0000-0000-000000000003'
const migration=(await read('supabase/migrations/20261117002722_farmplast_nj_msi_telemetry_bridge.sql')).replace('create extension if not exists http with schema extensions;','')
const db=new PGlite({extensions:{pgcrypto}})
await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions; create extension pgcrypto with schema extensions;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint); create table storage.objects(bucket_id text); alter table storage.objects enable row level security;
 create table public.v_asset_points_latest(asset_code text,point_code text,point_id uuid,value_number numeric,value_boolean boolean);
 create table public.telemetry_latest(point_id uuid primary key,asset_id uuid,device_id uuid,value_number double precision,value_boolean boolean,value_text text,quality text,source_timestamp timestamptz,updated_at timestamptz,raw_payload jsonb);
 create table public.devices(device_code text,device_secret text,is_active boolean);
 create schema ch1_private; create table ch1_private.config(singleton boolean primary key,device_key text);
 create table ch1_private.downloads(job_id uuid primary key,url text,expires_at timestamptz);
 create schema ch23_ota_private;
 create table public.chiller_ota_receipts(device text primary key,version text,boot_id text,job_id uuid,received_at timestamptz default now());
 create table public.legacy_counts(device text primary key,n int); insert into legacy_counts values('2',0),('3',0);
 create type extensions.http_header as(field varchar,value varchar);
 create type extensions.http_request as(method text,uri varchar,headers extensions.http_header[],content_type varchar,content varchar);
 create type extensions.http_response as(status int,content_type varchar,headers extensions.http_header[],content varchar);
 create function extensions.http(req extensions.http_request) returns extensions.http_response language plpgsql as $$ begin
 if current_setting('test.http_fail',true)='on' then raise exception 'Synthetic HTTP failure'; end if;
 perform set_config('test.last_http_uri',req.uri,false); perform set_config('test.last_http_body',req.content,false);
 return (200,'application/json',null,'{"o":null}')::extensions.http_response; end $$;
 create function public.ingest_ch2(payload jsonb) returns jsonb language plpgsql as $$ begin update public.legacy_counts set n=n+1 where device='2'; return '{"o":null}'::jsonb; end $$;
 create function public.ingest_ch3(payload jsonb) returns jsonb language plpgsql as $$ begin update public.legacy_counts set n=n+1 where device='3'; return '{"o":null}'::jsonb; end $$;
 create function public.chiller_ota_record_telemetry(p_device text,p_metadata jsonb) returns void language plpgsql as $$ begin
 insert into public.chiller_ota_receipts(device,version,boot_id,job_id) values(p_device,p_metadata->>'version',p_metadata->>'boot',nullif(p_metadata->>'job','')::uuid)
 on conflict(device) do update set version=excluded.version,boot_id=excluded.boot_id,job_id=excluded.job_id,received_at=now(); end $$;
 create function ch23_ota_private.exchange(p_device text,m jsonb,discover boolean) returns jsonb language plpgsql as $$ begin
 if not discover then raise exception 'Expected real receipt discovery'; end if; return jsonb_build_object('o',null); end $$;`)
for(const row of metadata.filter(p=>p.point_code.startsWith('CH1_'))) await db.query('insert into v_asset_points_latest values($1,$2,$3,$4,$5)',['CH-NJ-01',row.point_code,row.point_id,row.data_type==='number'?50:null,row.data_type==='boolean'?false:null])
await db.exec(await read('supabase/ch1_ota.sql'))
await db.exec('alter table public.ch1_ota_device add column protocol integer')
await db.query('insert into ch1_private.config values(true,$1)',[key])
for(const n of [2,3])await db.query('insert into devices values($1,$2,true)',[`ESP32-CH${n}-PLC`,key+n])
for(const name of ['ingest_ch1','ch1_control_reconcile','ch1_device_sync','ch1_ota_report','ch1_private_exchange'])await db.exec((await read('telemetry/baselines/'+name+'.sql'))+';')
await db.exec(migration)
const exchange=(device,secret,meta=gateway(),reported={})=>db.query('select public.nj_msi_exchange($1,$2,$3,$4) value',[device,secret,JSON.stringify(meta),JSON.stringify(reported)])

test('cloud and mirror keep original writers; relay sends only to the fixed MSI target and fails closed',async()=>{
 const payload={device_code:'ESP32-CH2-PLC',device_secret:key+'2',readings:[]}
 await db.query('select public.ingest_ch2($1)',[JSON.stringify(payload)])
 assert.equal((await db.query("select n from legacy_counts where device='2'")).rows[0].n,1)
 await db.exec("update nj_msi_private.routes set mode='mirror' where device='ESP32-CH2-PLC'")
 await db.query('select public.ingest_ch2($1)',[JSON.stringify(payload)])
 assert.equal((await db.query("select n from legacy_counts where device='2'")).rows[0].n,2)
 const body=(await db.query("select current_setting('test.last_http_body') body")).rows[0].body
 assert.equal(JSON.parse(body).payload.device_secret,undefined)
 await db.exec("select set_config('test.http_fail','on',false)")
 await db.query('select public.ingest_ch2($1)',[JSON.stringify(payload)])
 await db.exec("update nj_msi_private.routes set mode='relay' where device='ESP32-CH2-PLC'")
 await assert.rejects(db.query('select public.ingest_ch2($1)',[JSON.stringify(payload)]),/Synthetic HTTP failure/)
 assert.equal((await db.query("select n from legacy_counts where device='2'")).rows[0].n,3)
 await db.exec("select set_config('test.http_fail','off',false)")
 await db.query('select public.ingest_ch2($1)',[JSON.stringify(payload)])
 assert.equal((await db.query("select current_setting('test.last_http_uri') uri")).rows[0].uri,'https://msi.tail4626fb.ts.net:10000/v1/relay/chiller-2')
 assert.equal((await db.query("select n from legacy_counts where device='2'")).rows[0].n,3)
 await assert.rejects(db.query('select public.ingest_ch3($1)',[JSON.stringify(payload)]),/authentication/)
})
test('device callbacks reject wrong identity and metadata; receipts contain no sensor samples',async()=>{
 await assert.rejects(exchange('ESP32-CH3-PLC',key+'2'),/authentication/)
 await assert.rejects(exchange('ESP32-CH3-PLC',key+'3'),/not active/)
 await assert.rejects(exchange('ESP32-CH2-PLC',key+'2',{...gateway(),boot:'invalid'}),/metadata/)
 await assert.rejects(exchange('ESP32-CH2-PLC',key+'2',gateway(),{temperature:50}),/Unexpected/)
 const result=await exchange('ESP32-CH2-PLC',key+'2')
 assert.deepEqual(result.rows[0].value,{o:null})
 assert.equal((await db.query('select count(*) n from chiller_ota_receipts')).rows[0].n,1)
 assert.equal((await db.query('select count(*) n from telemetry_latest')).rows[0].n,0)
 await db.exec('set role anon')
 await assert.rejects(db.query('select * from nj_msi_private.routes'),/permission denied/)
 await assert.rejects(db.query("select nj_msi_private.send('ESP32-CH1','x','{}',false)"),/permission denied/)
 await db.exec('reset role')
})
test('CH1 command confirmation uses actual MSI report and matching revision, with repeatable reset sequence',async()=>{
 await db.exec("update nj_msi_private.routes set mode='relay' where device='ESP32-CH1'")
 await exchange('ESP32-CH1',key,gateway())
 const pending=(await db.query("select public.ch1_control_request($1,$2,'fan_setpoint','{\"setpoint\":90}') c",[user,job])).rows[0].c
 await exchange('ESP32-CH1',key,{...gateway(),command_revision:pending.revision},{setpoint:50})
 assert.equal((await db.query('select status from ch1_control_commands where id=$1',[job])).rows[0].status,'pending')
 await db.exec('update v_asset_points_latest set value_number=90')
 await db.query("insert into telemetry_latest(point_id,device_id,raw_payload) values('111996e4-ff83-4ad7-b4cd-233d326a30f7','db7a7808-8ceb-407a-bfbf-c215e42ffb93','{\"gateway\":{\"command_revision\":999}}')")
 await db.exec('select public.ch1_control_reconcile(); delete from telemetry_latest;')
 assert.equal((await db.query('select status from ch1_control_commands where id=$1',[job])).rows[0].status,'pending')
 await exchange('ESP32-CH1',key,{...gateway(),command_revision:pending.revision},{setpoint:90})
 assert.equal((await db.query('select status from ch1_control_commands where id=$1',[job])).rows[0].status,'applied')
 const resetId='00000000-0000-0000-0000-000000000004'
 const reset=(await db.query("select public.ch1_control_request($1,$2,'reset_alert','{\"reset\":true}') c",[user,resetId])).rows[0].c
 await exchange('ESP32-CH1',key,{...gateway(),command_revision:reset.revision,reset_sequence:reset.reset_sequence-1})
 assert.equal((await db.query('select status from ch1_control_commands where id=$1',[resetId])).rows[0].status,'pending')
 await exchange('ESP32-CH1',key,{...gateway(),command_revision:reset.revision,reset_sequence:reset.reset_sequence})
 assert.equal((await db.query('select status from ch1_control_commands where id=$1',[resetId])).rows[0].status,'applied')
 const receipt=(await db.query('select to_jsonb(t) value from nj_msi_private.ch1_receipt t')).rows[0].value
 assert.deepEqual(Object.keys(receipt).sort(),['boot_id','device','job_id','received_at','version'])
 assert.equal((await db.query('select count(*) n from telemetry_latest')).rows[0].n,0)
})
test('CH1 new-boot OTA completion requires an accepted MSI receipt; status-only reports cannot complete',async()=>{
 await db.query("insert into ch1_ota_releases(id,version,sha256,size,storage_path,approved) values($1,'msi-test-2',$2,1024,'test-only.bin',true)",[release,'a'.repeat(64)])
 const otaId='00000000-0000-0000-0000-000000000005'
 await db.query("insert into ch1_ota_jobs(id,operator_id,release_id,source_boot,status) values($1,$2,$3,$4,'waiting_for_telemetry')",[otaId,user,release,'a'.repeat(32)])
 const m={...gateway('msi-test-2'),job:otaId,boot:'b'.repeat(32),status:'waiting_for_telemetry',progress:99}
 await db.query("select public.ch1_device_sync($1,$2,$3,$4,99)",[m.version,m.boot,otaId,m.status])
 assert.equal((await db.query('select status from ch1_ota_jobs where id=$1',[otaId])).rows[0].status,'waiting_for_telemetry')
 await exchange('ESP32-CH1',key,m)
 assert.equal((await db.query('select status from ch1_ota_jobs where id=$1',[otaId])).rows[0].status,'completed')
 assert.equal((await db.query('select count(*) n from telemetry_latest')).rows[0].n,0)
 await assert.rejects(db.exec(migration),/already installed/)
 await db.exec('rollback')
 await db.close()
})
