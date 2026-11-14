import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identityDb,mapping,ingest,peter,robert} from './helpers/employee-identity-db.mjs'
const baseline=await readFile(new URL('./fixtures/zkt-compat-before.sql',import.meta.url),'utf8')
const processor=await readFile(new URL('./fixtures/zkt-legacy-processor.sql',import.meta.url),'utf8')
const patch=await readFile(new URL('../../supabase/migrations/20261114020935_zkt_verified_legacy_provenance.sql',import.meta.url),'utf8')
const event=timestamp=>({deviceUserId:'3',userId:'3',timestamp,inOutMode:255,verifyMode:2,workCode:0})
const snapshot=async db=>(await db.query(`select
 (select jsonb_agg(w order by id) from employee_work_logs w) work,
 (select jsonb_agg(w order by id) from employee_payments w) payments,
 (select jsonb_agg(w order by id) from payroll_checks w) checks,
 (select jsonb_agg(w order by id) from zkt_attendance_logs w) raw,
 (select jsonb_agg(w order by id) from zkt_identity_events w) events`)).rows[0]
async function setup(){
 const db=await identityDb()
 await db.exec(`alter table employee_employment_periods add column work_started_at timestamptz,add column transferred_from_period_id bigint;
  alter table employee_work_logs add column created_at timestamptz default now(),add column auto_closed boolean,add column punch_error text,add column downtime_hours numeric default 0;
  alter table employee_work_logs rename constraint employee_work_logs_employee_id_work_date_key to employee_work_logs_employee_day_unique;
  alter table zkt_attendance_logs add column created_at timestamptz default now();
  create table employee_feature_flags(flag text primary key,enabled boolean);
  create schema employee_presence_private;create function employee_presence_private.refresh_snapshot() returns void language sql as $$ select $$;`)
 await db.exec(baseline)
 await db.exec(processor)
 await db.query("select change_employee_employment($1,'terminate','2026-11-12')",[peter])
 await db.exec("update employee_number_reservations set released_at=now();update employee_number_config set reuse_enabled=true")
 await db.query("insert into employees(id,employee_number,active,hire_date,plant_location,first_name,last_name,hourly_rate,default_lunch_hours,shift_type) values($1,3,true,'2026-11-13','NJ','New','Fixture',20,0.5,'day')",[robert])
 await mapping(db,'nj',robert,'2026-11-13T05:00Z')
 return db
}
async function raw(db,stamp,instant){return (await db.query("insert into zkt_attendance_logs(employee_number,punch_time_local,punch_time,raw) values(3,$1,coalesce($2::timestamptz,$1::timestamp at time zone 'America/New_York'),$3) returning id",[stamp,instant??null,JSON.stringify(event(stamp))])).rows[0].id}
const owner=async(db,id)=>(await db.query('select zkt_compat_event_owner($1) id',[id])).rows[0].id

test('migration and device binding leave raw events, prior hours, payments and checks intact',async()=>{
 const db=await setup();try{
  await db.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out,source,manually_edited,reg_hours,labor_amount) values($1,'2026-11-11','08:30','16:00','manual',true,7,140)",[peter])
  await db.query("insert into employee_payments(employee_id,amount) values($1,140)",[peter])
  await db.query("insert into payroll_checks(employee_id,pay_period_start,pay_period_end,status) values($1,'2026-11-09','2026-11-15','printed')",[peter])
  const old=await raw(db,'2026-11-12 08:00:00');const fresh=await raw(db,'2026-11-13 08:23:47');
  const unique=(await db.query("insert into employees(employee_number,active,hire_date,plant_location,first_name,last_name) values(5,true,'2026-11-01','NJ','Unique','Fixture') returning id")).rows[0].id;
  const uniqueRaw=(await db.query("insert into zkt_attendance_logs(employee_number,punch_time_local,punch_time,raw) values(5,'2026-11-13 08:00:00','2026-11-13T13:00:00Z','{}') returning id")).rows[0].id;
  assert.equal(await owner(db,uniqueRaw),unique);
  const before=await snapshot(db);assert.equal(await owner(db,fresh),null);
  await db.exec(patch);assert.deepEqual(await snapshot(db),before);
  assert.equal(await owner(db,uniqueRaw),unique,'Ordinary unique-number compatibility stays intact');
  await ingest(db,'nj',[event('2026-11-12 08:00:00'),event('2026-11-13 08:23:47')]);
  assert.equal(await owner(db,old),null);assert.equal(await owner(db,fresh),robert);
  const after=await snapshot(db);for(const field of ['work','payments','checks','raw'])assert.deepEqual(after[field],before[field]);
  await assert.rejects(db.query('update zkt_attendance_logs set raw=\'{}\''),/immutable/);
  await assert.rejects(db.query('update zkt_event_ownership set employee_id=$1',[peter]),/immutable/);
 }finally{await db.close()}
})
test('fresh verified punches populate the new employee through the unchanged production processor',async()=>{
 const db=await setup();try{
  await db.exec(patch);await raw(db,'2026-11-13 08:23:47');await raw(db,'2026-11-13 16:43:35');
  await db.query('select process_zkt_attendance_to_work_logs()');
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id=$1',[robert])).rows[0].n,0);
  await ingest(db,'nj',[event('2026-11-13 08:23:47'),event('2026-11-13 16:43:35')]);
  await db.query('select process_zkt_attendance_to_work_logs()');
  const rows=(await db.query('select * from employee_work_logs where employee_id=$1',[robert])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].source,'zkt');assert.equal(rows[0].time_in,'08:23:47');assert.equal(rows[0].time_out,'16:43:35');
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id=$1',[peter])).rows[0].n,0);
  await db.query("insert into payroll_checks(employee_id,pay_period_start,pay_period_end,status) values($1,'2026-11-09','2026-11-15','printed')",[robert]);
  await raw(db,'2026-11-13 17:00:00');await ingest(db,'nj',[event('2026-11-13 17:00:00')]);await db.query('select process_zkt_attendance_to_work_logs()');
  assert.deepEqual((await db.query('select * from employee_work_logs where employee_id=$1',[robert])).rows,rows);
 }finally{await db.close()}
})
test('different instant, wrong serial, unmapped plant and conflicting device ownership never guess an owner',async()=>{
 const db=await setup();try{
  await db.exec(patch);const fresh=await raw(db,'2026-11-13 08:23:47');const wrong=await raw(db,'2026-11-13 09:23:47','2026-11-13T15:23:47Z');
  await assert.rejects(db.query("select ingest_zkt_identity_events('nj','WRONG',$1)",[JSON.stringify([event('2026-11-13 08:23:47')])]));
  await ingest(db,'pa',[event('2026-11-13 08:23:47')]);assert.equal(await owner(db,fresh),null);
  await ingest(db,'nj',[event('2026-11-13 08:23:47'),event('2026-11-13 09:23:47')]);assert.equal(await owner(db,wrong),null);
  await mapping(db,'pa',peter,'2026-11-13T05:00Z');assert.equal(await owner(db,fresh),null,'Conflicting independent evidence must fail closed');
  await db.query(`insert into zkt_event_ownership(event_id,employee_id,mapping_id)
    select e.id,$1,h.id from zkt_identity_events e cross join zkt_identifier_history h
    where e.legacy_raw_id=$2 and h.device_key='pa' and h.employee_id=$1`,[peter,fresh]);
  assert.equal(await owner(db,fresh),peter,'Permanent legacy ownership cannot be displaced by independent reads');
 }finally{await db.close()}
})
