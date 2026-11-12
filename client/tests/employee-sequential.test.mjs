import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {formerThreeFixture,createEmployee,peter,robert,admin} from './helpers/employee-sequential-db.mjs'
import {createSacsCaller} from '../server/sacsSync.mjs'
const next=async db=>(await db.query('select next_available_employee_number() n')).rows[0].n
const dbFor=()=>formerThreeFixture(new PGlite())

test('an unfinished reservation stays occupied even without an active profile; an archived HR claim does not',async()=>{
 const db=await dbFor()
 try {
  await db.query(`insert into employee_employment_periods(employee_id,employee_number,hire_date,legacy_inactive,terminal_user_id)
    values($1,3,current_date,false,3) returning id`,[robert]).then(async result=>{
      // This simulates an interrupted assignment, not an archived employment period.
      await db.query('update employee_number_reservations set hr_released_at=now() where employee_id=$1 and employee_number=3',[peter])
      await db.query('insert into employee_number_reservations(period_id,employee_id,employee_number) values($1,$2,3)',[result.rows[0].id,robert])
    })
  assert.equal(await next(db),4)
  await assert.rejects(createEmployee(db,'Concurrent incomplete claim',false,3),e=>e.code==='23505'&&/Next free Employee Number: 4/.test(e.message))
 }finally{await db.close()}
})

test('former #3 becomes the first free number with all lifecycle/reuse flags OFF; #4 is next, not historical high-water mark',async()=>{
 const db=await dbFor()
 try {
  assert.equal(await next(db),3)
  const old=(await db.query('select * from employees where id=$1',[peter])).rows[0]
  const fresh=await createEmployee(db,'New three',true,3)
  assert.equal(fresh.employee_number,3);assert.equal(fresh.zkt_user_id,3);assert.notEqual(fresh.id,peter)
  assert.equal(fresh.zkt_enabled,false);assert.equal(fresh.zkt_sync_status,'pending')
  assert.match(fresh.zkt_sync_error,/Previous terminal identity/)
  assert.equal(await next(db),4)
  const fourth=await createEmployee(db,'New four',false)
  assert.equal(fourth.employee_number,4);assert.equal(fourth.zkt_sync_status,'disabled')
  assert.deepEqual((await db.query('select * from employees where id=$1',[peter])).rows[0],old)
  const previous=(await db.query('select released_at,hr_released_at from employee_number_reservations where employee_id=$1',[peter])).rows[0]
  assert.equal(previous.released_at,null);assert.ok(previous.hr_released_at)
  assert.equal((await db.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,0)
  assert.equal((await db.query("select count(*)::int n from employee_feature_flags where enabled and flag<>'former_employees_archive_readonly'")).rows[0].n,0)
 }finally{await db.close()}
})

test('manual number is saved exactly; active/reserved conflicts suggest next number; configured range and exhaustion enforced',async()=>{
 const db=await dbFor()
 try {
  const manual=await createEmployee(db,'Manual twenty',false,20)
  assert.equal(manual.employee_number,20);assert.equal(manual.zkt_user_id,20);assert.equal(await next(db),3)
  await assert.rejects(createEmployee(db,'Duplicate',false,1),e=>e.code==='23505'&&/Next free Employee Number: 3/.test(e.message))
  await assert.rejects(createEmployee(db,'Beyond maximum',false,101),e=>e.code==='23514')
  await assert.rejects(createEmployee(db,'Zero',false,0),e=>e.code==='23514')
  await db.exec('update employee_number_config set minimum=3,maximum=4')
  assert.equal((await createEmployee(db,'Three',false)).employee_number,3)
  assert.equal((await createEmployee(db,'Four',false)).employee_number,4)
  await assert.rejects(db.query('select next_available_employee_number()'),/No free Employee Number/)
  await assert.rejects(db.query('update employees set employee_number=40 where id=$1',[manual.id]),/feature flag|lifecycle/)
 }finally{await db.close()}
})

test('RLS failure rolls back HR release and does not consume the proposed number; non-admin cannot allocate',async()=>{
 const db=await dbFor()
 try {
  await db.exec(`set role authenticated;set test.uid='${admin}'`)
  await assert.rejects(db.query('select employee_hr_occupied_numbers()'),/permission denied/)
  await db.exec('reset role;create policy fixture_deny_insert on employees as restrictive for insert to authenticated with check(false);set role authenticated')
  await assert.rejects(createEmployee(db,'Denied',true,3),e=>e.code==='42501')
  assert.equal(await next(db),3)
  await db.exec('reset role')
  assert.equal((await db.query('select hr_released_at from employee_number_reservations where employee_id=$1',[peter])).rows[0].hr_released_at,null)
  await db.exec("set role authenticated;set test.uid='00000000-0000-0000-0000-000000000099'")
  await assert.rejects(db.query('select next_available_employee_number()'),e=>e.code==='42501')
 }finally{await db.close()}
})

test('UUID and timestamp ownership isolate old raw replays and payroll; production Attendance functions remain unchanged',async()=>{
 const db=await dbFor()
 try {
  await db.exec("insert into zkt_identity_devices(device_key,plant_location,serial_number,verified,inventory_verified) values('nj','NJ','NJ-SERIAL',true,true),('pa','PA','PA-SERIAL',true,true)")
  const definitions=async()=>(await db.query("select proname,pg_get_functiondef(oid) d from pg_proc where pronamespace='public'::regnamespace and proname in ('zkt_compat_event_owner','process_zkt_attendance_to_work_logs','ingest_zkt_identity_events') order by proname")).rows
  const oldSnapshot=async()=>({work:(await db.query('select * from employee_work_logs where employee_id=$1',[peter])).rows,payroll:(await db.query('select * from employee_payments where employee_id=$1',[peter])).rows,checks:(await db.query('select * from payroll_checks where employee_id=$1',[peter])).rows,raw:(await db.query('select * from zkt_attendance_logs order by id')).rows})
  const before=await oldSnapshot(),functions=await definitions()
  const fresh=await createEmployee(db,'New owner',true,3)
  const period=(await db.query('select * from employee_employment_periods where employee_id=$1',[fresh.id])).rows[0]
  for(const kind of ['time_in','time_out'])await assert.rejects(db.query(`insert into employee_work_logs(employee_id,work_date,${kind})
    select $1,(($2::timestamptz-interval '1 minute') at time zone 'America/New_York')::date,
      (($2::timestamptz-interval '1 minute') at time zone 'America/New_York')::time`,[fresh.id,period.work_started_at]),/employment period|assignment start/)
  await assert.rejects(db.query("select record_verified_zkt_mapping('nj','3',$1,$2,'2024-01-01',null,'Synthetic invalid early assignment')",[fresh.id,period.id]),/assignment start/)
  await assert.rejects(db.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out) values($1,'2025-01-02','08:00','16:00')",[fresh.id]),/employment period|assignment start/)
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id=$1',[fresh.id])).rows[0].n,0)
  assert.equal((await db.query('select zkt_compat_event_owner(id) owner from zkt_attendance_logs where employee_number=3')).rows[0].owner,null)
  // Verified synthetic mapping for the OLD person, and a separate NEW interval.
  const oldPeriod=(await db.query('select id from employee_employment_periods where employee_id=$1',[peter])).rows[0].id
  await db.query("select record_verified_zkt_mapping('nj','3',$1,$2,'2024-01-01','2025-01-03','Synthetic old interval')",[peter,oldPeriod])
  const mid=(await db.query("select record_verified_zkt_mapping('nj','3',$1,$2,$3,null,'Synthetic new verified assignment') id",[fresh.id,period.id,period.work_started_at])).rows[0].id
  await db.query('update zkt_identifier_history set processing_verified=true where id=$1',[mid])
  const times=(await db.query("select to_char((clock_timestamp()+interval '1 minute') at time zone 'America/New_York','YYYY-MM-DD HH24:MI:SS') a,to_char((clock_timestamp()+interval '3 minutes') at time zone 'America/New_York','YYYY-MM-DD HH24:MI:SS') b")).rows[0]
  const event=(timestamp,mode)=>({deviceUserId:'3',timestamp,inOutMode:mode,verifyMode:1})
  const events=[event('2025-01-02 08:00:00',0),event(times.a,0),event(times.b,1)]
  await db.exec("set test.role='service_role'")
  for(let i=0;i<2;i++)await db.query("select ingest_zkt_identity_events('nj','NJ-SERIAL',$1)",[JSON.stringify(events)])
  await db.query('select process_zkt_attendance_to_work_logs()')
  const owners=(await db.query('select e.local_timestamp,o.employee_id from zkt_event_ownership o join zkt_identity_events e on e.id=o.event_id order by e.local_timestamp')).rows
  assert.equal(owners[0].employee_id,peter);assert.ok(owners.slice(1).every(x=>x.employee_id===fresh.id))
  const hours=(await db.query('select * from employee_work_logs where employee_id=$1',[fresh.id])).rows
  assert.equal(hours.length,1);assert.ok(Number(hours[0].reg_hours)>0)
  assert.deepEqual(await oldSnapshot(),before);assert.deepEqual(await definitions(),functions)
  assert.equal((await db.query('select count(*)::int n from employee_payments where employee_id=$1',[fresh.id])).rows[0].n,0)
 }finally{await db.close()}
})

test('active SACS roster keeps the new UUID and old payroll stays attached to the former UUID',async()=>{
 const db=await dbFor()
 try {
  const fresh=await createEmployee(db,'New SACS owner',false,3)
  const roster=(await db.query('select * from employees')).rows
  let sent
  const caller=createSacsCaller({enabled:true,secret:'synthetic',url:'https://sacs.invalid/sync',clientForToken:()=>({auth:{getUser:async()=>({data:{user:{id:admin}}})},from(){const filters=[];const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},order(){return chain},async limit(){return{data:roster.filter(e=>filters.every(([k,v])=>e[k]===v))}}};return chain}}),fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body).employees;return{ok:true,json:async()=>({synced:sent.length,failed:0,results:sent.map(e=>({source_employee_id:e.source_employee_id,status:'updated'}))})}}})
  assert.equal((await caller({method:'POST',authorization:'Bearer fixture',body:{plant_location:'NJ'}})).status,200)
  assert.ok(sent.every(e=>e.is_active));assert.ok(!sent.some(e=>e.source_employee_id===peter))
  assert.equal(sent.find(e=>e.employee_number==='3').source_employee_id,fresh.id)
  const queued=(await db.query("select payload from employee_integration_operations where employee_id=$1 and action='activate' and target='SACS'",[fresh.id])).rows[0].payload
  assert.equal(queued.source_employee_id,fresh.id)
 }finally{await db.close()}
})
