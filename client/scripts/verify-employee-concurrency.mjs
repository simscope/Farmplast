// Real, isolated PostgreSQL; refuses remote hosts/other data directories.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {writeFile,readFile} from 'node:fs/promises'
import {initializeIdentityDb,admin,peter} from '../tests/helpers/employee-identity-db.mjs'
const runtime=resolve(process.argv[2]||'../../reports/phase2-postgres-runtime')
const phase5=process.argv.includes('--phase5')
const require=createRequire(`${runtime}/package.json`)
const {Client}=require('pg')
const options={host:'127.0.0.1',port:phase5?55441:55439,user:phase5?'phase5_local':'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
const control=new Client(options)
await control.connect()
const system=(await control.query("select current_user, current_setting('data_directory') directory,version() version")).rows[0]
assert.equal(system.current_user,options.user)
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
  await a.query(await readFile(new URL('../../supabase/employee_release_gates.sql',import.meta.url),'utf8'))
  await assert.rejects(a.query("select change_employee_employment($1,'terminate','2025-01-01')",[peter]),/gate is OFF/)
  await assert.rejects(a.query('update employee_number_config set reuse_enabled=true'),/eight current/)
  // Enable only synthetic lifecycle fixtures in this guarded disposable cluster.
  await a.query('update employee_release_config set actions_enabled=true')
  checks.push('real PostgreSQL release migration defaults OFF and rejects lifecycle/reuse without confirmations')
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

  // Release shutdown uses allocation lock -> config row lock, as lifecycle does.
  await begin(b)
  await b.query('select pg_advisory_xact_lock(736261,2)')
  const stopped=observed(a.query("select change_employee_employment($1,'rehire','2025-05-01')",[peter]))
  await waiting(a)
  await b.query('update employee_release_config set actions_enabled=false')
  await b.query('commit')
  assert.match((await stopped).error?.message||'',/gate is OFF/)
  checks.push('concurrent release shutdown uses consistent lock order and prevents a waiting lifecycle operation')

  if(phase5){
    await a.query(await readFile(new URL('../../supabase/employee_archive_feature_flags.sql',import.meta.url),'utf8'))
    await a.query("update employee_feature_flags set enabled=true where flag='employee_terminate'")
    await begin(b)
    await b.query("select employee_require_feature('employee_terminate')")
    const disabling=observed(a.query("update employee_feature_flags set enabled=false where flag='employee_terminate'"))
    await waiting(a)
    await b.query('commit')
    assert.equal((await disabling).error,undefined)
    await assert.rejects(b.query("select employee_require_feature('employee_terminate')"),error=>error.code==='42501')
    checks.push('feature shutdown waits for the in-flight feature row lock, then denies subsequent requests')
    await a.query("update employee_feature_flags set enabled=true where flag='employee_terminate'")
    await begin(a)
    await a.query("update employee_feature_flags set enabled=false where flag='employee_terminate'")
    const admission=observed(b.query("select employee_require_feature('employee_terminate')"))
    await waiting(b)
    await a.query('commit')
    assert.equal((await admission).error?.code,'42501')
    checks.push('waiting admission rechecks enabled after concurrent OFF commit and fails closed')

    // Exercise the safety transition with native PostgreSQL, not only PGlite.
    await a.query("update employee_release_config set actions_enabled=true; update employee_feature_flags set enabled=true where flag in ('employee_terminate','employee_rehire')")
    await a.query("select change_employee_employment($1,'terminate','2025-01-01')",[first.id])
    await assert.rejects(a.query("select change_employee_employment($1,'rehire','2025-02-01')",[first.id]),/previous number to be safely released/)
    const acknowledge=async(target,state='absent')=>{
      await b.query("set test.role='service_role'")
      const op=(await b.query("select id,device_key,terminal_user_id from employee_integration_operations where employee_id=$1 and action='disable' and target=$2 order by period_id desc limit 1",[first.id,target])).rows[0]
      const job=(await b.query('select claim_employee_integration($1,$2) job',[op.id,op.device_key])).rows[0].job
      const result=target==='SACS'?{ok:true,source_employee_id:first.id,is_active:false}:
        {ok:true,serialNumber:`${target}-SERIAL`,userId:op.terminal_user_id,enabled:false,readBackVerified:true,state}
      await b.query('select finish_employee_integration($1,$2,$3)',[op.id,job.claim_token,JSON.stringify(result)])
    }
    await acknowledge('NJ','disabled');await acknowledge('PA');await acknowledge('SACS')
    assert.equal((await a.query('select released_at from employee_number_reservations where employee_id=$1',[first.id])).rows[0].released_at,null)
    await a.query('select retry_employee_integrations($1)',[first.id])
    await acknowledge('NJ')
    await a.query("update employee_feature_flags set enabled=false where flag='employee_terminate'")
    await a.query("select change_employee_employment($1,'rehire','2025-02-01')",[first.id])
    assert.deepEqual((await a.query('select id,employee_number,zkt_user_id,active from employees where id=$1',[first.id])).rows[0],{id:first.id,employee_number:1,zkt_user_id:1,active:true})
    assert.equal((await a.query("select enabled from employee_feature_flags where flag='employee_number_reuse'")).rows[0].enabled,false)
    checks.push('native PG reserves disabled biometric account until all absence/SACS ACKs; Rehire works independently with Terminate and Reuse OFF')
  }

  const report={verified_at:new Date().toISOString(),engine:system.version,mode:'loopback disposable PostgreSQL, synthetic records only',checks}
  await writeFile(resolve(runtime,phase5?'phase5-concurrency-verification.local.json':'concurrency-verification.local.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify({passed:true,checks:checks.length,engine:system.version.split(' on ')[0]}))
}finally{
  await Promise.allSettled([a.query('rollback'),b.query('rollback')])
  await Promise.allSettled([a.end(),b.end(),control.end()])
}
