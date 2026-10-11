// Real, isolated PostgreSQL; refuses remote hosts/other data directories.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {initializeIdentityDb,admin,peter} from '../tests/helpers/employee-identity-db.mjs'
const runtime=resolve(process.argv[2]||'../../reports/phase2-postgres-runtime')
const require=createRequire(`${runtime}/package.json`)
const {Client}=require('pg')
const options={host:'127.0.0.1',port:55439,user:'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
const control=new Client(options)
await control.connect()
const system=(await control.query("select current_user, current_setting('data_directory') directory,version() version")).rows[0]
assert.equal(system.current_user,'phase2_local')
assert.equal(resolve(system.directory).toLowerCase(),resolve(runtime,'data').toLowerCase(),'Only the disposable cluster is permitted')
const name=`phase2_verify_${Date.now()}`
await control.query(`create database ${name}`)
const a=new Client({...options,database:name}),b=new Client({...options,database:name})
const checks=[]
const begin=async client=>{await client.query('begin');await client.query("set statement_timeout='10s'")}
const waiting=async client=>{
  const pid=client.processID
  for(let i=0;i<100;i++){
    const state=(await control.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]
    if(state?.wait_event_type==='Lock')return
    await new Promise(resolve=>setTimeout(resolve,20))
  }
  throw Error('Second session did not wait on the expected database lock')
}
const observed=promise=>promise.then(value=>({value}),error=>({error}))
try{
  await a.connect();await b.connect()
  await initializeIdentityDb({exec:sql=>a.query(sql),query:(sql,values)=>a.query(sql,values)})
  for(const client of [a,b])await client.query(`set test.uid='${admin}';set test.role='authenticated'`)

  await begin(a)
  const first=(await a.query("insert into employees(active,hire_date,first_name,last_name,plant_location) values(true,'2024-01-01','Concurrent A','Fixture','NJ') returning id,employee_number,zkt_user_id")).rows[0]
  await begin(b)
  const pending=observed(b.query("insert into employees(active,hire_date,first_name,last_name,plant_location) values(true,'2024-01-01','Concurrent B','Fixture','NJ') returning id,employee_number,zkt_user_id"))
  await waiting(b);await a.query('commit')
  const secondResult=await pending;assert.ifError(secondResult.error)
  const second=secondResult.value.rows[0];await b.query('commit')
  assert.deepEqual([first.employee_number,second.employee_number],[1,2])
  assert.notEqual(first.zkt_user_id,second.zkt_user_id)
  checks.push('two real sessions serialize create and allocate distinct smallest numbers/principals')

  // INSERT that starts during termination waits, then rejects opening a shift.
  await begin(a);await a.query('select id from employees where id=$1 for update',[peter])
  const punch=observed(b.query("insert into employee_work_logs(employee_id,work_date,time_in,approved) values($1,'2025-01-01','08:00',false)",[peter]))
  await waiting(b)
  await a.query("select change_employee_employment($1,'terminate','2025-01-01')",[peter]);await a.query('commit')
  assert.match((await punch).error?.message||'',/former employee/)
  checks.push('in-flight work-log INSERT cannot open a shift after termination commits')

  // Rehire holds allocation lock; concurrent create waits and gets the next number.
  await begin(a)
  await a.query("select change_employee_employment($1,'rehire','2025-02-01')",[peter])
  const rehired=(await a.query('select employee_number from employees where id=$1',[peter])).rows[0].employee_number
  const newPerson=observed(b.query("insert into employees(active,first_name,last_name,plant_location) values(true,'Concurrent C','Fixture','NJ') returning employee_number"))
  await waiting(b);await a.query('commit')
  const created=await newPerson;assert.ifError(created.error)
  assert.equal(rehired,4);assert.equal(created.value.rows[0].employee_number,5)
  checks.push('concurrent rehire versus create cannot claim the same HR number')

  // An already inserted, uncommitted open shift holds the employee mutex.
  await begin(b)
  await b.query("insert into employee_work_logs(employee_id,work_date,time_in,approved) values($1,'2025-03-01','08:00',false)",[peter])
  const terminate=observed(a.query("select change_employee_employment($1,'terminate','2025-03-01')",[peter]))
  await waiting(a);await b.query('commit')
  assert.match((await terminate).error?.message||'',/Close open shifts/)
  checks.push('termination waits for concurrent open shift and then refuses to archive')
  await b.query("update employee_work_logs set time_out='16:00',approved=true where employee_id=$1",[peter])

  // A concurrent draft check is similarly visible before the lifecycle checks.
  await begin(b)
  await b.query("insert into payroll_checks(employee_id,pay_period_start,pay_period_end,status) values($1,'2025-03-01','2025-03-07','draft')",[peter])
  const payrollTerminate=observed(a.query("select change_employee_employment($1,'terminate','2025-03-07')",[peter]))
  await waiting(a);await b.query('commit')
  assert.match((await payrollTerminate).error?.message||'',/Finalize outstanding payroll/)
  checks.push('termination waits for concurrent draft payroll and refuses to archive')
  await b.query("update payroll_checks set status='printed' where employee_id=$1",[peter])

  // Service claim wins the mutex before rehire: running SACS blocks the change.
  await a.query("select change_employee_employment($1,'terminate','2025-03-07')",[peter])
  const job=(await a.query("select id from employee_integration_operations where employee_id=$1 and target='SACS' and action='disable' and status='pending' order by period_id desc limit 1",[peter])).rows[0]
  await b.query("set test.role='service_role'");await begin(b)
  await b.query('select claim_employee_integration($1,null)',[job.id])
  const rehire=observed(a.query("select change_employee_employment($1,'rehire','2025-04-01')",[peter]))
  await waiting(a);await b.query('commit')
  assert.match((await rehire).error?.message||'',/SACS synchronization in progress/)
  checks.push('concurrent SACS claim versus rehire cannot send a delayed inactive write after rehire')

  const report={verified_at:new Date().toISOString(),engine:system.version,mode:'loopback disposable PostgreSQL, synthetic records only',checks}
  await writeFile(resolve(runtime,'concurrency-verification.local.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:true,checks:checks.length,engine:system.version.split(' on ')[0]}))
}finally{
  await Promise.allSettled([a.query('rollback'),b.query('rollback')])
  await Promise.allSettled([a.end(),b.end(),control.end()])
}
