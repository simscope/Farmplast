import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {initializeTerminationDb,admin,peter} from './helpers/employee-termination-db.mjs'
const sql=async file=>readFile(new URL(`../../supabase/${file}`,import.meta.url),'utf8')
const common=await sql('migrations/20261114030203_zkt_general_assignment_import.sql')
const guards=await sql('migrations/20261114031250_zkt_assignment_sync_guards.sql')
const partialFix=await sql('migrations/20261114032229_zkt_readback_partial_inventory.sql')
async function setup(){
 const db=await initializeTerminationDb(new PGlite())
 await db.exec(await sql('employee_plant_transfer.sql'))
 await db.exec(await readFile(new URL('./fixtures/zkt-compat-before.sql',import.meta.url),'utf8'))
 await db.exec(await sql('migrations/20261114020935_zkt_verified_legacy_provenance.sql'))
 await db.exec(`alter table zkt_attendance_logs add column created_at timestamptz default now(),add constraint zkt_fixture_dedupe unique(employee_number,punch_time);
  alter table zkt_bridge_commands add constraint zkt_bridge_commands_status_check check(status in ('pending','pending_pa','running','done','error'));
  create schema employee_presence_private;create function employee_presence_private.refresh_snapshot() returns void language sql as $$select$$;
  insert into zkt_identity_devices(device_key,plant_location,serial_number,verified,inventory_verified) values('nj','NJ','NJ-SERIAL',true,true),('pa','PA','PA-SERIAL',true,true);`)
 await db.exec(await readFile(new URL('./fixtures/zkt-legacy-processor.sql',import.meta.url),'utf8'))
 await db.exec(common)
 await db.exec(guards)
 await db.exec(partialFix)
 await db.exec('create trigger zkt_general_fixture_processor after insert on zkt_attendance_logs for each row execute function after_zkt_attendance_log_insert()')
 await db.exec(`update farmplast_zkt_private.import_release set started_at='2026-11-01T04:00Z';set test.role='authenticated'`)
 return db
}
const create=async(db,name,number,plant='NJ',requested=true)=>(await db.query(`insert into employees(employee_number,first_name,last_name,active,hire_date,plant_location,shift_type,hourly_rate,default_lunch_hours,zkt_enabled)
 values($1,$2,'Fixture',true,'2026-11-09',$3,'day',20,0.5,$4) returning *`,[number,name,plant,requested])).rows[0]
const confirm=async(db,employee,device='nj')=>{await db.exec("set test.role='service_role'");return (await db.query('select confirm_zkt_assignment_readback($1,$2,$3) r',[device,device==='nj'?'NJ-SERIAL':'PA-SERIAL',JSON.stringify([{id:String(employee.zkt_user_id),name:`${employee.first_name} Fixture`.slice(0,24),enabled:true}])])).rows[0].r}
const event=(id,stamp)=>({deviceUserId:String(id),timestamp:stamp})
const importEvents=async(db,device,events)=>(await db.query('select ingest_zkt_attendance_batch($1,$2,$3) r',[device,device==='nj'?'NJ-SERIAL':'PA-SERIAL',JSON.stringify(events)])).rows[0].r
const history=async db=>(await db.query(`select
 (select jsonb_agg(w order by id) from employee_work_logs w where employee_id='${peter}') work,
 (select jsonb_agg(p order by id) from employee_payments p) payments,
 (select jsonb_agg(c order by id) from payroll_checks c) checks,
 (select jsonb_agg(r order by id) from zkt_attendance_logs r) raw`)).rows[0]

test('reusing a number queues the common sync, assigns new punches to its new UUID and preserves old history',async()=>{
 const db=await setup();try{
  await db.query("select terminate_employee($1,'2026-11-12')",[peter]);const before=await history(db)
  const person=await create(db,'New owner',3)
  assert.equal(person.zkt_enabled,false);assert.equal(person.zkt_sync_status,'pending')
  assert.equal((await db.query("select status from zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=$1",[person.id])).rows[0].status,'pending_attendance')
  await db.query("update employee_employment_periods set work_started_at='2026-11-13T05:00Z' where employee_id=$1",[person.id])
  assert.equal((await confirm(db,person)).accepted,1)
  const fresh=[event(3,'2026-11-13 08:00:00'),event(3,'2026-11-13 16:00:00')]
  await importEvents(db,'nj',fresh)
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id=$1',[person.id])).rows[0].n,0,'A batch defers per-row processing until its device evidence is committed')
  await db.query('select process_zkt_attendance_to_work_logs()')
  const rows=(await db.query('select * from employee_work_logs where employee_id=$1',[person.id])).rows
  assert.equal(rows.length,1);assert.equal(rows[0].source,'zkt');assert.equal(rows[0].time_in,'08:00:00');assert.equal(rows[0].time_out,'16:00:00')
  const after=await history(db);for(const key of ['work','payments','checks'])assert.deepEqual(after[key],before[key])
  await importEvents(db,'nj',fresh);assert.equal((await db.query('select count(*)::int n from zkt_attendance_logs where employee_number=3 and punch_time_local::date=\'2026-11-13\'')).rows[0].n,2)
  await assert.rejects(db.query('update zkt_attendance_logs set raw=\'{}\''),/immutable/)
 }finally{await db.close()}
})
test('the same common batch accepts different numbers in both plants; wrong device, name or actor cannot bind',async()=>{
 const db=await setup();try{
  const nj=await create(db,'NJ owner',4);const pa=await create(db,'PA owner',100,'PA')
  for(const person of [nj,pa])await db.query("update employee_employment_periods set work_started_at='2026-11-13T05:00Z' where employee_id=$1",[person.id])
  await db.exec("set test.role='service_role'")
  assert.equal((await db.query("select confirm_zkt_assignment_readback('nj','NJ-SERIAL',$1) r",[JSON.stringify([{id:'4',name:'Former owner',enabled:true}])])).rows[0].r.accepted,0)
  await assert.rejects(db.query("select confirm_zkt_assignment_readback('nj','WRONG','[]')"))
  await db.exec("set test.role='authenticated';set role authenticated")
  await assert.rejects(db.query("select confirm_zkt_assignment_readback('nj','NJ-SERIAL','[]')"),/permission denied/)
  await db.exec('reset role')
  await confirm(db,nj);await confirm(db,pa,'pa')
  await assert.rejects(db.query("select validate_zkt_assignment_sync($1,'pa','PA-SERIAL')",[nj.id]),/no rows/)
  await db.query("select validate_zkt_assignment_sync($1,'nj','NJ-SERIAL')",[nj.id])
  await importEvents(db,'nj',[event(4,'2026-11-13 08:00:00'),event(4,'2026-11-13 16:00:00')])
  await importEvents(db,'pa',[event(100,'2026-11-13 08:00:00'),event(100,'2026-11-13 16:00:00')])
  await db.query('select process_zkt_attendance_to_work_logs()')
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id in ($1,$2)',[nj.id,pa.id])).rows[0].n,2)
  const invalid=await importEvents(db,'nj',[event(4,'2026-11-01 01:30:00'),event(4,'2026-03-08 02:30:00')]);assert.equal(invalid.skipped,2)
 }finally{await db.close()}
})
test('manual hours remain editable from hire date before profile creation, with strict UUID and automatic import boundaries',async()=>{
 const db=await setup();try{
  await db.query("select terminate_employee($1,'2026-11-09')",[peter]);const person=await create(db,'Manual owner',3)
  await db.query("update employee_employment_periods set work_started_at='2026-11-12T19:19:57Z' where employee_id=$1",[person.id])
  await db.exec(`grant insert,update on employee_work_logs to authenticated;set role authenticated;set test.uid='${admin}';set test.role='authenticated'`)
  const work=(await db.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out,source) values($1,'2026-11-09','08:30','16:00','manual') returning id",[person.id])).rows[0]
  await db.query("update employee_work_logs set time_out='17:00',source='manual' where id=$1",[work.id])
  await assert.rejects(db.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out,source) values($1,'2026-11-08','08:00','16:00','manual')",[person.id]),/employment period|assignment start/)
  await db.exec('reset role');await confirm(db,person)
  const before=(await db.query('select * from employee_work_logs where id=$1',[work.id])).rows
  await importEvents(db,'nj',[event(3,'2026-11-09 08:00:00'),event(3,'2026-11-09 18:00:00')]);await db.query('select process_zkt_attendance_to_work_logs()')
  assert.deepEqual((await db.query('select * from employee_work_logs where id=$1',[work.id])).rows,before)
 }finally{await db.close()}
})
test('requested syncs use one queue; explicit opt-out remains disabled and existing verified cutovers stay intact',async()=>{
 const db=await setup();try{
  const person=await create(db,'No ZKT',4,'NJ',false)
  assert.equal((await db.query("select count(*)::int n from zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=$1",[person.id])).rows[0].n,0)
  await db.exec(`set role authenticated;set test.role='authenticated';set test.uid='${admin}'`)
  await db.query('update employees set zkt_enabled=true where id=$1',[person.id]);await db.exec('reset role')
  assert.equal((await db.query("select count(*)::int n from zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=$1",[person.id])).rows[0].n,1)
  await db.exec(`set role authenticated;set test.role='authenticated'`);await db.query('update employees set zkt_enabled=false where id=$1',[person.id]);await db.exec('reset role')
  assert.equal((await confirm(db,person)).accepted,0)
  assert.equal((await db.query('select zkt_enabled from employees where id=$1',[person.id])).rows[0].zkt_enabled,false)
  await db.exec("set test.role='authenticated'");const reserved=await create(db,'Reserved account',6)
  assert.equal((await db.query("select count(*)::int n from zkt_bridge_commands where command='sync_one_employee' and payload->>'employee_id'=$1",[reserved.id])).rows[0].n,0)
  await db.exec("set test.role='service_role'");await assert.rejects(db.query("select validate_zkt_assignment_sync($1,'nj','NJ-SERIAL')",[reserved.id]),/Reserved terminal/)
 }finally{await db.close()}
})

test('a second reuse closes the old interval without moving permanent ownership or overwriting former hours',async()=>{
 const db=await setup();try{
  await db.query("select terminate_employee($1,'2026-11-12')",[peter])
  const first=await create(db,'First replacement',3)
  await db.query("update employee_employment_periods set work_started_at='2026-11-13T05:00Z' where employee_id=$1",[first.id]);assert.equal((await confirm(db,first)).accepted,1)
  await importEvents(db,'nj',[event(3,'2026-11-13 08:00:00'),event(3,'2026-11-13 16:00:00')]);await db.query('select process_zkt_attendance_to_work_logs()')
  const before=(await db.query('select * from employee_work_logs where employee_id=$1',[first.id])).rows
  await db.exec("set test.role='authenticated'");await db.query("select terminate_employee($1,'2026-11-13')",[first.id])
  const second=await create(db,'Second replacement',3)
  await db.query("update employee_employment_periods set work_started_at='2026-11-13T22:00Z' where employee_id=$1",[second.id]);assert.equal((await confirm(db,second)).accepted,1)
  await importEvents(db,'nj',[event(3,'2026-11-13 12:00:00'),event(3,'2026-11-13 17:10:00'),event(3,'2026-11-13 18:10:00')]);await db.query('select process_zkt_attendance_to_work_logs()')
  assert.deepEqual((await db.query('select * from employee_work_logs where employee_id=$1',[first.id])).rows,before)
  const rows=(await db.query('select * from employee_work_logs where employee_id=$1',[second.id])).rows;assert.equal(rows.length,1)
  // Late-day punches retain the production processor's existing OUT heuristic.
  const owners=(await db.query("select r.local_timestamp::text local_timestamp,o.employee_id from zkt_identity_events r join zkt_event_ownership o on o.event_id=r.id where r.terminal_user_id='3' and r.legacy_raw_id is null order by r.local_timestamp")).rows
  assert.ok(owners.filter(r=>r.local_timestamp.includes('12:00:00')).every(r=>r.employee_id===first.id))
  assert.ok(owners.filter(r=>r.local_timestamp.includes('17:10:00')).every(r=>r.employee_id===second.id))
 }finally{await db.close()}
})

test('a single employee SDK readback cannot enqueue unrelated employees from a partial inventory',async()=>{
 const db=await setup();try{
  const target=await create(db,'Partial target',4);const other=await create(db,'Other target',5)
  await db.exec("update zkt_bridge_commands set status='done' where command='sync_one_employee'")
  assert.equal((await confirm(db,target)).accepted,1)
  assert.equal((await db.query("select count(*)::int n from zkt_bridge_commands where command='sync_one_employee' and status in ('pending','pending_pa','pending_attendance','running')")).rows[0].n,0)
  assert.equal((await db.query('select zkt_enabled from employees where id=$1',[other.id])).rows[0].zkt_enabled,false)
 }finally{await db.close()}
})
