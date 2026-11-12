import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { initializeCreationDb, admin, peter, robert } from './helpers/employee-creation-db.mjs'
const create = async (db, name, enabled) => (await db.query(`insert into employees(employee_number,active,first_name,last_name,plant_location,shift_type,hire_date,zkt_enabled)
 values(null,true,$1,'Fixture','NJ','day','2026-10-23',$2) returning *`,[name,enabled])).rows[0]

test('reproduces production: NULL terminal maximum blocks suggestion and explicit creation; OFF flag separately blocks auto creation', async () => {
 const db=await initializeCreationDb(new PGlite(),{applyFix:false})
 try {
  await assert.rejects(db.query('select next_available_employee_number()'),/Terminal employee number range/)
  await assert.rejects(db.query("insert into employees(employee_number,active,first_name,plant_location) values(5,true,'New','NJ')"),/Terminal employee number range/)
  await assert.rejects(create(db,'New',false),/employee_number_reuse.*OFF/)
 } finally {await db.close()}
})

test('new HR numbers allocate with reuse OFF and no terminal configuration, for both ZKT choices', async () => {
 const db=await initializeCreationDb(new PGlite())
 try {
  assert.equal((await db.query('select next_available_employee_number() n')).rows[0].n,5)
  const pending=await create(db,'With ZKT',true),disabled=await create(db,'Without ZKT',false)
  assert.deepEqual([pending.employee_number,disabled.employee_number],[5,8])
  assert.equal(pending.zkt_enabled,false);assert.equal(pending.zkt_sync_status,'pending');assert.equal(pending.zkt_synced_at,null)
  assert.equal(pending.zkt_sync_error,'Terminal employee number range is not configured.')
  assert.equal(disabled.zkt_enabled,false);assert.equal(disabled.zkt_sync_status,'disabled')
  assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from employee_integration_operations where target=\'SACS\'')).rows[0].n,2)
  assert.deepEqual((await db.query('select maximum,reuse_enabled from employee_number_config')).rows[0],{maximum:null,reuse_enabled:false})
  assert.equal((await db.query("select count(*)::int n from employee_feature_flags where flag<>'former_employees_archive_readonly' and enabled")).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from employee_number_reservations where employee_id=any($1::uuid[])',[ [pending.id,disabled.id] ])).rows[0].n,2)
 } finally {await db.close()}
})

test('server rejects existing, former, released, raw-history and retained terminal numbers, and missing required name', async () => {
 const db=await initializeCreationDb(new PGlite())
 try {
  for(const number of [1,2,3,4,6,7])await assert.rejects(db.query("insert into employees(employee_number,active,first_name,plant_location) values($1,true,'Conflict','NJ')",[number]),error=>error.code==='23505')
  await assert.rejects(create(db,'   ',false),error=>error.code==='23514')
  await assert.rejects(db.query("insert into employees(employee_number,active,first_name,plant_location) values(0,true,'Invalid','NJ')"),error=>error.code==='23514')
  await assert.rejects(db.query("insert into employees(employee_number,active,first_name,plant_location) values(10,true,'Invalid','XX')"),error=>error.code==='23514')
  assert.equal((await db.query('select next_available_employee_number() n')).rows[0].n,5)
 } finally {await db.close()}
})

test('real RLS/trigger checks allow authenticated admin, deny non-admin, deny private helpers, and roll back reservations on policy failure', async () => {
 const db=await initializeCreationDb(new PGlite())
 try {
  await db.exec(`set role authenticated;set test.uid='${admin}'`)
  const row=await create(db,'Authorized',false)
  assert.equal((await db.query('select id from employees where id=$1',[row.id])).rows.length,1)
  await assert.rejects(db.query('select next_unused_employee_number()'),/permission denied/)
  await db.exec("set test.uid='00000000-0000-0000-0000-000000000099'")
  await assert.rejects(create(db,'Unauthorized',false),error=>error.code==='42501')
  await assert.rejects(db.query('select next_available_employee_number()'),error=>error.code==='42501')
  await db.exec(`reset role;set test.uid='${admin}';create policy fixture_deny_insert on employees as restrictive for insert to authenticated with check(false);set role authenticated`)
  const before=(await db.query('select next_available_employee_number() n')).rows[0].n
  await assert.rejects(create(db,'Denied by RLS',false),error=>error.code==='42501')
  assert.equal((await db.query('select next_available_employee_number() n')).rows[0].n,before)
 } finally {await db.close()}
})

test('configured terminal readiness only affects queuing; requested sync stays unconfirmed and opt-out queues no terminal command', async () => {
 const db=await initializeCreationDb(new PGlite())
 try {
  await db.exec("update employee_number_config set maximum=4")
  const beyond=await create(db,'Outside terminal range',true)
  assert.equal(beyond.employee_number,5);assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,0)
  await db.exec("update employee_number_config set maximum=100;insert into zkt_identity_devices(device_key,plant_location,serial_number,verified,inventory_verified) values('nj','NJ','TEST-NJ',true,true),('pa','PA','TEST-PA',true,true)")
  const requested=await create(db,'Configured pending',true)
  assert.equal(requested.zkt_enabled,false)
  assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,1)
  const optout=await create(db,'Opt out',false)
  assert.equal(optout.zkt_sync_status,'disabled');assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,1)
  await db.exec("update zkt_identity_devices set inventory_verified=false where device_key='nj'")
  await create(db,'Unverified inventory',true)
  assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,1)
 } finally {await db.close()}
})

test('creation changes no existing employee/history rows or Payroll/Attendance/SSO function definitions', async () => {
 const db=await initializeCreationDb(new PGlite())
 try {
  const snapshot=async()=>({employees:(await db.query('select * from employees where id=any($1::uuid[]) order by id',[[peter,robert]])).rows,work:(await db.query('select * from employee_work_logs order by id')).rows,payments:(await db.query('select * from employee_payments order by id')).rows,checks:(await db.query('select * from payroll_checks order by id')).rows,raw:(await db.query('select * from zkt_attendance_logs order by id')).rows,functions:(await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('process_zkt_attendance_to_work_logs','rebuild_zkt_work_logs','claim_employee_integration','finish_employee_integration','change_employee_employment') order by proname")).rows})
  const before=await snapshot();await create(db,'New profile',true);assert.deepEqual(await snapshot(),before)
  await assert.rejects(db.query('update employees set employee_number=30 where id=$1',[peter]),/feature flag|lifecycle/)
  await assert.rejects(db.query("select change_employee_employment($1,'terminate','2026-10-23')",[peter]),/(feature flag|release gate).*OFF/)
 } finally {await db.close()}
})
