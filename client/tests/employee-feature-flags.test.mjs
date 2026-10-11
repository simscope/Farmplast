import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identityDb,peter} from './helpers/employee-identity-db.mjs'
import {createEmployeeIntegrationEndpoint} from '../server/employeeIntegrationEndpoint.mjs'

const migration=await readFile(new URL('../../supabase/employee_archive_feature_flags.sql',import.meta.url),'utf8')
test('new integration API rejects disabled or missing flags before service credentials or writes',async()=>{
  let flags={data:{employee_terminate:false,employee_rehire:false}},admin=true,calls=0
  const client={auth:{getUser:async()=>({data:{user:{id:peter}}})},rpc:async name=>name==='employee_archive_admin'?{data:admin}:flags}
  const run=createEmployeeIntegrationEndpoint({callerForToken:()=>client,serviceClient:()=>{calls++;throw Error('must not run')}})
  const request={method:'POST',authorization:'Bearer synthetic',body:{employee_id:peter}}
  for(const value of [flags,{data:null},{error:{code:'PGRST202'}}]){
    flags=value;assert.equal((await run(request)).body.error,'employee_actions_disabled')
  }
  admin=false;assert.equal((await run(request)).body.error,'admin_required')
  assert.equal((await run({...request,body:{employee_id:peter,action:'create'}})).status,400)
  assert.equal((await run({...request,authorization:null})).status,401)
  assert.equal(calls,0)
})
test('independent flags deny lifecycle, direct writes and hidden RPC bypass',async()=>{
  const db=await identityDb()
  try{
    await db.exec(migration)
    const flags=(await db.query('select employee_feature_flags_status() flags')).rows[0].flags
    assert.deepEqual(flags,{former_employees_archive_readonly:false,employee_terminate:false,employee_rehire:false,employee_number_reuse:false})
    await assert.rejects(db.query('select list_former_employees()'),/archive is OFF/)
    for(const action of ['terminate','rehire'])await assert.rejects(db.query('select change_employee_employment($1,$2,current_date)',[peter,action]),/feature flag .* OFF/)
    await db.exec("set farmplast.lifecycle_write='on'")
    await assert.rejects(db.query('update employees set active=false where id=$1',[peter]),/feature flag .* OFF/)
    await db.exec('grant usage on schema public,auth to authenticated; grant select on employees to authenticated; set role authenticated')
    await assert.rejects(db.query('select change_employee_employment_pre_flags($1,\'terminate\',current_date)',[peter]),/permission denied/)
    await assert.rejects(db.query('update employee_feature_flags set enabled=true'),/permission denied/)
    // The advanced fixture retains its separate legacy active-period policy.
    assert.equal((await db.query('select count(*)::int n from employee_employment_periods')).rows[0].n,1)
    assert.match((await db.query("select qual from pg_policies where policyname='employee_period_admin_read'")).rows[0].qual,/employee_feature_enabled/)
  }finally{await db.close()}
})
test('archive switch preserves ordinary creation and processors; advanced enable fails closed',async()=>{
  const db=await identityDb()
  try{
    const before=(await db.query("select pg_get_functiondef('process_zkt_attendance_to_work_logs()'::regprocedure) d")).rows[0].d
    await db.exec(migration)
    await db.exec("update employee_feature_flags set enabled=true where flag='former_employees_archive_readonly'")
    assert.equal((await db.query('select count(*)::int n from list_former_employees()')).rows[0].n,0)
    await db.exec("update employee_feature_flags set enabled=false; insert into employees(employee_number,active,hire_date,first_name,last_name,plant_location) values(10,true,current_date,'Synthetic','New','NJ')")
    assert.equal((await db.query('select count(*)::int n from employees where employee_number=10')).rows[0].n,1)
    await assert.rejects(db.exec("insert into employees(active,first_name,last_name,plant_location) values(true,'Synthetic','Auto','NJ')"),/employee_number_reuse.*OFF/)
    await assert.rejects(db.query('select retry_employee_integrations($1)',[peter]),/employee_rehire.*OFF/)
    assert.equal((await db.query("select pg_get_functiondef('process_zkt_attendance_to_work_logs()'::regprocedure) d")).rows[0].d,before)
    await assert.rejects(db.exec("update employee_feature_flags set enabled=true where flag='employee_number_reuse'"))
    assert.equal((await db.query("select enabled from employee_feature_flags where flag='employee_number_reuse'")).rows[0].enabled,false)
    await assert.rejects(db.query('select list_former_employees()'),/archive is OFF/)
  }finally{await db.close()}
})
