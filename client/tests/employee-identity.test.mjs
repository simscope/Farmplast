import test from 'node:test'
import assert from 'node:assert/strict'
import { identityDb, mapping, ingest, peter, robert } from './helpers/employee-identity-db.mjs'
const event=(timestamp,mode=0,user='3')=>({deviceUserId:user,userId:user,timestamp,inOutMode:mode,verifyMode:1,workCode:0})

test('legacy raw events remain unchanged and quarantined without current-number inference',async()=>{
  const db=await identityDb()
  try {
    assert.equal((await db.query('select count(*)::int n from zkt_identity_review')).rows[0].n,1)
    assert.equal((await db.query('select count(*)::int n from zkt_event_ownership')).rows[0].n,0)
    await assert.rejects(db.query("update zkt_attendance_logs set employee_number=4"),/immutable/)
    await assert.rejects(db.query('delete from zkt_identity_events'),/immutable/)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select process_zkt_attendance_to_work_logs_pre_identity()'),/permission denied/)
  } finally {await db.close()}
})

test('delayed/replayed events retain permanent owner across number reuse and distinct plants',async()=>{
  const db=await identityDb()
  try {
    await mapping(db,'nj',peter,'2024-01-01T00:00Z','2025-01-01T00:00Z')
    await db.query("select change_employee_employment($1,'terminate','2024-12-31')",[peter])
    // Reuse is still disabled, even if a reservation is physically released.
    await db.exec("update employee_number_reservations set released_at=now();update employee_number_config set reuse_enabled=true")
    await db.query("insert into employees(id,employee_number,active,hire_date,plant_location,first_name,last_name) values($1,3,true,'2025-01-01','NJ','Robert','Test')",[robert])
    await mapping(db,'nj',robert,'2025-01-01T00:00Z')
    await mapping(db,'pa',peter,'2024-01-01T00:00Z','2025-01-01T00:00Z')
    const old=event('2024-06-01 08:00:00'),fresh=event('2025-06-01 08:00:00')
    await ingest(db,'nj',[old,fresh]);await ingest(db,'nj',[old,fresh]);await ingest(db,'pa',[old])
    const owners=(await db.query('select e.device_key,e.raw->>\'timestamp\' stamp,o.employee_id from zkt_event_ownership o join zkt_identity_events e on e.id=o.event_id order by e.id')).rows
    assert.deepEqual(owners,[{device_key:'nj',stamp:old.timestamp,employee_id:peter},{device_key:'nj',stamp:fresh.timestamp,employee_id:robert},{device_key:'pa',stamp:old.timestamp,employee_id:peter}])
    await assert.rejects(db.query('update zkt_event_ownership set employee_id=$1',[robert]),/immutable/)
    await assert.rejects(mapping(db,'nj',robert,'2024-01-01T00:00Z'),/Overlapping/)
  } finally {await db.close()}
})

test('DST, invalid times, missing mapping, wrong serial and unsupported punches fail closed',async()=>{
  const db=await identityDb()
  try {
    await mapping(db,'nj',peter,'2024-01-01T00:00Z')
    const result=await ingest(db,'nj',[event('2025-11-02 01:30:00'),event('2025-03-09 02:30:00'),event('bad'),event('2025-06-01 08:00:00',0,'999')])
    assert.equal(result.review,4)
    assert.equal(result.owned,0)
    await assert.rejects(db.query("select ingest_zkt_identity_events('nj','WRONG','[]')"))
    await ingest(db,'nj',[event('2025-06-01 08:00:00',2)])
    await db.query('select process_zkt_attendance_to_work_logs()')
    assert.equal((await db.query('select count(*)::int n from employee_work_logs')).rows[0].n,0)
  } finally {await db.close()}
})

test('safe processing does not delete historical days or rewrite saved payroll when late events arrive',async()=>{
  const db=await identityDb()
  try {
    await mapping(db,'nj',peter,'2024-01-01T00:00Z')
    await db.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out,approved,reg_hours,labor_amount) values($1,'2024-01-02','08:00','16:00',true,7,140)",[peter])
    const before=(await db.query('select * from employee_work_logs')).rows
    await ingest(db,'nj',[event('2025-06-01 08:00:00'),event('2025-06-01 16:00:00',1)])
    await db.query('select process_zkt_attendance_to_work_logs()')
    const newday=(await db.query("select * from employee_work_logs where work_date='2025-06-01'")).rows[0]
    assert.equal(newday.employee_id,peter);assert.equal(newday.reg_hours,'7.00')
    assert.deepEqual((await db.query("select * from employee_work_logs where work_date='2024-01-02'")).rows,before)
    await db.query("insert into payroll_checks(employee_id,pay_period_start,pay_period_end,status) values($1,'2025-06-01','2025-06-07','printed')",[peter])
    await ingest(db,'nj',[event('2025-06-01 17:00:00',1)])
    await db.query('select rebuild_zkt_work_logs()')
    assert.deepEqual((await db.query("select * from employee_work_logs where work_date='2025-06-01'")).rows[0],newday)
  } finally {await db.close()}
})

test('archive completes offline, reservation waits for both verified devices, rehire preserves UUID',async()=>{
  const db=await identityDb()
  try {
    await db.query("select change_employee_employment($1,'terminate','2025-01-01','Resigned','Keep history')",[peter])
    assert.equal((await db.query('select active from employees where id=$1',[peter])).rows[0].active,false)
    assert.equal((await db.query('select released_at from employee_number_reservations')).rows[0].released_at,null)
    const ack=async(target,serial,ok=true)=>{
      const op=(await db.query('select id,device_key from employee_integration_operations where target=$1 and action=\'disable\'',[target])).rows[0]
      await db.exec("set test.role='service_role'")
      const job=(await db.query('select claim_employee_integration($1,$2) job',[op.id,op.device_key])).rows[0].job
      await db.query('select finish_employee_integration($1,$2,$3)',[op.id,job.claim_token,JSON.stringify({ok,serialNumber:serial,userId:'3',enabled:false,readBackVerified:ok})])
    }
    await ack('NJ','NJ-SERIAL')
    assert.equal((await db.query('select released_at from employee_number_reservations')).rows[0].released_at,null)
    await ack('PA','WRONG')
    assert.equal((await db.query('select released_at from employee_number_reservations')).rows[0].released_at,null)
    await ack('PA','PA-SERIAL')
    assert.ok((await db.query('select released_at from employee_number_reservations')).rows[0].released_at)
    await db.exec("set test.role='authenticated'")
    await db.query("select change_employee_employment($1,'rehire','2025-02-01')",[peter])
    const person=(await db.query('select id,employee_number,active from employees where id=$1',[peter])).rows[0]
    assert.equal(person.id,peter);assert.equal(person.employee_number,1);assert.equal(person.active,true)
    assert.equal((await db.query('select count(*)::int n from employee_employment_periods where employee_id=$1',[peter])).rows[0].n,2)
  } finally {await db.close()}
})

test('database allocates smallest safe number across concurrent callers and holds inactive reservations',async()=>{
  const db=await identityDb()
  try {
    await Promise.all([db.query("insert into employees(active,first_name,last_name,plant_location) values(true,'A','Test','NJ')"),db.query("insert into employees(active,first_name,last_name,plant_location) values(true,'B','Test','NJ')")])
    assert.deepEqual((await db.query('select employee_number from employees order by employee_number')).rows.map(row=>row.employee_number),[1,2,3])
    await db.query("select change_employee_employment($1,'terminate','2025-01-01')",[peter])
    assert.equal((await db.query('select next_available_employee_number() n')).rows[0].n,4)
  } finally {await db.close()}
})

test('late OUT closes only a new identity day without becoming a manual edit; real manual edits stay frozen',async()=>{
  const db=await identityDb()
  try{
    await mapping(db,'nj',peter,'2024-01-01T00:00Z')
    await ingest(db,'nj',[event('2025-06-01 08:00:00')]);await db.query('select process_zkt_attendance_to_work_logs()')
    await ingest(db,'nj',[event('2025-06-01 16:00:00',1)]);await db.query('select process_zkt_attendance_to_work_logs()')
    const day=(await db.query('select * from employee_work_logs')).rows[0]
    assert.equal(day.time_out,'16:00:00');assert.equal(day.manually_edited,false)
    await db.exec("update employee_work_logs set time_out='15:00' where work_date='2025-06-01'")
    await db.query('select process_zkt_attendance_to_work_logs()')
    const manual=(await db.query('select * from employee_work_logs')).rows[0]
    assert.equal(manual.time_out,'15:00:00');assert.equal(manual.manually_edited,true)
    await assert.rejects(db.query("update zkt_identifier_history set valid_to='2025-06-01 12:00Z'"),/exclude permanently owned/)
  }finally{await db.close()}
})

test('legacy evidence is additive and requires a verified device and historical interval',async()=>{
  const db=await identityDb()
  try{
    const before=(await db.query('select * from zkt_attendance_logs')).rows
    const eid=(await db.query('select id from zkt_identity_events')).rows[0].id
    assert.equal((await db.query("select confirm_legacy_zkt_device($1,'nj','Independent device export') owned",[eid])).rows[0].owned,false)
    await mapping(db,'nj',peter,'2024-01-01T00:00Z','2025-01-01T00:00Z')
    assert.equal((await db.query('select employee_id from zkt_event_ownership')).rows[0].employee_id,peter)
    assert.deepEqual((await db.query('select * from zkt_attendance_logs')).rows,before)
    await assert.rejects(db.query("update zkt_legacy_device_evidence set device_key='pa'"),/immutable/)
    const result=await ingest(db,'nj',[{deviceUserId:'3'}]);assert.equal(result.review,1)
    assert.equal((await db.query('select count(*)::int n from zkt_identity_review')).rows[0].n,2)
  }finally{await db.close()}
})

test('provisioning excludes unknown retained terminal accounts and refuses incomplete inventories',async()=>{
  const db=await identityDb()
  try{
    await db.exec("insert into zkt_reserved_terminal_identifiers values('1','Verified local account'),('2','Verified legacy account');update zkt_identity_devices set inventory_verified=false where device_key='pa'")
    await assert.rejects(db.query("insert into employees(active,first_name,last_name,plant_location) values(true,'New','Person','NJ')"),/complete NJ\/PA/)
    await db.exec("update zkt_identity_devices set inventory_verified=true where device_key='pa'")
    const row=(await db.query("insert into employees(active,first_name,last_name,plant_location) values(true,'New','Person','NJ') returning employee_number,zkt_user_id")).rows[0]
    assert.equal(row.employee_number,1);assert.equal(row.zkt_user_id,4)
  }finally{await db.close()}
})

test('running SACS acknowledgement blocks rehire and stale activation cannot be claimed',async()=>{
  const db=await identityDb()
  try{
    const created=(await db.query("insert into employees(active,hire_date,first_name,last_name,plant_location) values(true,'2024-01-01','New','Person','NJ') returning id")).rows[0]
    const activation=(await db.query("select id from employee_integration_operations where employee_id=$1 and target='SACS'",[created.id])).rows[0]
    await db.query("select change_employee_employment($1,'terminate','2025-01-01')",[created.id])
    await db.exec("set test.role='service_role'")
    await assert.rejects(db.query('select claim_employee_integration($1,null)',[activation.id]),/Stale activation/)
    const disable=(await db.query("select id from employee_integration_operations where employee_id=$1 and target='SACS' and action='disable'",[created.id])).rows[0]
    await db.query('select claim_employee_integration($1,null)',[disable.id])
    await db.exec("set test.role='authenticated'")
    await assert.rejects(db.query("select change_employee_employment($1,'rehire','2025-02-01')",[created.id]),/SACS synchronization in progress/)
  }finally{await db.close()}
})

test('service worker can ingest through RPC but cannot rewrite mappings, reservations or terminal principals',async()=>{
  const db=await identityDb()
  try{
    await db.exec("set test.role='service_role';set role service_role")
    await db.query("select ingest_zkt_identity_events('nj','NJ-SERIAL','[]')")
    await assert.rejects(db.query("update employee_number_reservations set released_at=now()"),/permission denied/)
    await assert.rejects(db.query("update zkt_identifier_history set evidence='forged'"),/permission denied/)
    await db.exec('reset role')
    await assert.rejects(db.query('update zkt_identity_principals set terminal_user_id=99'),/immutable/)
  }finally{await db.close()}
})
