import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {initializeTerminationDb,admin,peter,robert} from './helpers/employee-termination-db.mjs'
import {terminateEmployee,terminationBlockers} from '../src/utils/terminateEmployee.js'
const setup=()=>initializeTerminationDb(new PGlite())
const terminate=(db,date='2025-01-02')=>db.query("select terminate_employee($1,$2,'End of employment',null) id",[peter,date])
const history=async db=>({work:(await db.query('select * from employee_work_logs order by id')).rows,payroll:(await db.query('select * from employee_payments order by id')).rows,checks:(await db.query('select * from payroll_checks order by id')).rows,raw:(await db.query('select * from zkt_attendance_logs order by id')).rows,ownership:(await db.query('select * from zkt_event_ownership order by event_id')).rows})

test('Terminate ON preserves legacy Attendance/Presence for unique active UUIDs and still quarantines reused numbers',async()=>{
 const db=await setup()
 try {
  const owners=(await db.query('select employee_number,zkt_compat_event_owner(id) owner from zkt_attendance_logs order by employee_number')).rows
  assert.equal(owners.find(x=>x.employee_number===3).owner,peter)
  assert.equal(owners.find(x=>x.employee_number===4).owner,null)
  await terminate(db)
  await db.query("insert into employees(employee_number,active,first_name,plant_location,hire_date,zkt_enabled) values(3,true,'Different UUID','NJ',current_date,false)")
  assert.equal((await db.query('select zkt_compat_event_owner(id) owner from zkt_attendance_logs where employee_number=3')).rows[0].owner,null)
  assert.equal((await db.query('select count(*)::int n from employee_work_logs where employee_id<>$1',[peter])).rows[0].n,0)
 }finally{await db.close()}
})

test('closed unapproved rows can archive atomically; UUID/number/history remain and HR number becomes free',async()=>{
 const db=await setup()
 try {
  const before=await history(db),old=(await db.query('select * from employees where id=$1',[peter])).rows[0]
  await db.exec(`set role authenticated;set test.uid='${admin}'`)
  const preview=(await db.query('select employee_termination_preview($1) p',[peter])).rows[0].p
  assert.equal(preview.last_work_date,'2025-01-02');assert.deepEqual(terminationBlockers(preview),[])
  assert.equal((await terminate(db)).rows[0].id,peter)
  assert.equal((await db.query('select count(*)::int n from list_former_employees() where id=$1',[peter])).rows[0].n,1)
  await db.exec('reset role')
  const archived=(await db.query('select * from employees where id=$1',[peter])).rows[0]
  assert.equal(archived.active,false);assert.equal(archived.id,old.id);assert.equal(archived.employee_number,old.employee_number)
  assert.equal(archived.zkt_user_id,old.zkt_user_id);assert.equal(archived.zkt_enabled,false);assert.equal(archived.zkt_sync_status,'pending')
  assert.match(archived.zkt_sync_error,/not been confirmed/)
  assert.deepEqual(await history(db),before)
  assert.equal((await db.query('select next_available_employee_number() n')).rows[0].n,3)
  assert.equal((await db.query('select released_at from employee_number_reservations where employee_id=$1',[peter])).rows[0].released_at,null)
  const op=(await db.query("select payload from employee_integration_operations where employee_id=$1 and action='disable' and target='SACS'",[peter])).rows[0].payload
  assert.equal(op.source_employee_id,peter);assert.equal(op.is_active,false)
  await assert.rejects(terminate(db),/already inactive/)
 }finally{await db.close()}
})

test('invalid dates and post-cutoff work still block termination',async()=>{
 for(const scenario of ['future date','before hire','post-cutoff work']) {
  const db=await setup()
  try {
   let date='2025-01-02',expected
   if(scenario==='future date'){date='2099-01-01';expected=/not a future date/}
   if(scenario==='before hire'){date='2023-12-31';expected=/precede the hire/}
   if(scenario==='post-cutoff work'){date='2025-01-01';expected=/Work history exists/}
   const before=await history(db)
   await assert.rejects(terminate(db,date),expected)
   assert.equal((await db.query('select active from employees where id=$1',[peter])).rows[0].active,true)
   assert.deepEqual(await history(db),before)
   assert.equal((await db.query('select termination_date from employee_employment_periods where employee_id=$1',[peter])).rows[0].termination_date,null)
  }finally{await db.close()}
 }
})

test('admin authorization, direct lifecycle guards and independent OFF switches stay enforced',async()=>{
 const db=await setup()
 try {
  const flags=(await db.query('select employee_feature_flags_status() f')).rows[0].f
  assert.deepEqual(flags,{employee_terminate:true,employee_rehire:false,employee_number_reuse:false,former_employees_archive_readonly:true})
  await assert.rejects(db.query('update employees set active=false where id=$1',[peter]),/lifecycle/)
  await assert.rejects(db.query("select change_employee_employment($1,'rehire','2025-01-03')",[robert]),/employee_rehire.*OFF/)
  await db.exec("set role authenticated;set test.uid='00000000-0000-0000-0000-000000000099'")
  await assert.rejects(terminate(db),e=>e.code==='42501')
  await assert.rejects(db.query('select employee_termination_preview($1)',[peter]),e=>e.code==='42501')
  await db.exec(`reset role;set test.uid='${admin}';update employee_feature_flags set enabled=false where flag='employee_terminate'`)
  await assert.rejects(terminate(db),/employee_terminate.*OFF/)
  await assert.rejects(db.query("select change_employee_employment($1,'terminate','2025-01-02')",[peter]),/employee_terminate.*OFF/)
 }finally{await db.close()}
})

test('original lifecycle RPC uses restored termination; missing last name retains a valid SACS snapshot',async()=>{
 const db=await setup()
 try {
  await db.query('update employees set last_name=null where id=$1',[peter])
  await db.query("select change_employee_employment($1,'terminate','2025-01-02')",[peter])
  assert.equal((await db.query("select payload->>'full_name' name from employee_integration_operations where employee_id=$1 and action='disable'",[peter])).rows[0].name,'Peter')
 }finally{await db.close()}
})

test('SACS outage after confirmed archive is pending, without retrying termination',async()=>{
 const calls=[]
 const client={rpc:async(name,args)=>{calls.push({name,args});return{data:peter,error:null}}}
 const result=await terminateEmployee({client,employeeId:peter,date:'2025-01-02',reason:' Left ',deliver:async()=>{throw Error('offline')}})
 assert.equal(result.sacsConfirmed,false);assert.equal(result.employeeId,peter);assert.equal(calls.length,1)
 assert.equal(calls[0].args.p_reason,'Left')
 let delivered=false
 await assert.rejects(terminateEmployee({client:{rpc:async()=>({error:{message:'Close open shifts'}})},employeeId:peter,date:'2025-01-02',reason:'',deliver:async()=>{delivered=true}}),/Close open shifts/)
 assert.equal(delivered,false)
})

test('open shifts and draft payroll checks allow archive without changing history',async()=>{
 const db=await setup()
 try {
  await db.query('update employee_work_logs set time_out=null where employee_id=$1',[peter])
  await db.query("update payroll_checks set status='draft' where employee_id=$1",[peter])
  const before=await history(db)
  const preview=(await db.query('select employee_termination_preview($1) p',[peter])).rows[0].p
  assert.ok(preview.open_shifts>0);assert.ok(preview.pending_checks>0)
  assert.deepEqual(terminationBlockers(preview),[])
  await terminate(db)
  assert.equal((await db.query('select active from employees where id=$1',[peter])).rows[0].active,false)
  assert.deepEqual(await history(db),before)
 }finally{await db.close()}
})

test('running SACS does not block archive; disable waits for the earlier acknowledgement',async()=>{
 const db=await setup()
 try {
  const prior=(await db.query("insert into employee_integration_operations(period_id,employee_id,action,target,payload,status,claim_token) select id,employee_id,'activate','SACS',jsonb_build_object('is_active',true),'running',gen_random_uuid() from employee_employment_periods where employee_id=$1 returning id,claim_token",[peter])).rows[0]
  const before=await history(db)
  const preview=(await db.query('select employee_termination_preview($1) p',[peter])).rows[0].p
  assert.equal(preview.running_sacs,1);assert.deepEqual(terminationBlockers(preview),[])
  await terminate(db)
  assert.deepEqual(await history(db),before)
  const disable=(await db.query("select id from employee_integration_operations where employee_id=$1 and action='disable' and target='SACS'",[peter])).rows[0]
  await db.exec("set test.role='service_role'")
  await assert.rejects(db.query('select claim_employee_integration($1)',[disable.id]),/earlier operation is running/)
  await db.query('select finish_employee_integration($1,$2,$3)',[prior.id,prior.claim_token,JSON.stringify({ok:true,source_employee_id:peter,is_active:true})])
  const job=(await db.query('select claim_employee_integration($1) j',[disable.id])).rows[0].j
  assert.equal(job.payload.is_active,false);assert.equal(job.employee_id,peter)
  assert.equal((await db.query('select active from employees where id=$1',[peter])).rows[0].active,false)
 }finally{await db.close()}
})
