// Runs only against the explicitly guarded disposable loopback PostgreSQL cluster.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { initializeCreationDb, admin, peter, robert } from '../tests/helpers/employee-creation-db.mjs'
const runtime=resolve(process.argv[2]||'../../reports/phase2-postgres-runtime')
const require=createRequire(resolve(runtime,'package.json'))
const {Client}=require('pg')
const options={host:'127.0.0.1',port:55439,user:'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
const control=new Client(options)
await control.connect()
const identity=(await control.query("select current_user,current_setting('data_directory') directory,version() version")).rows[0]
assert.equal(identity.current_user,'phase2_local')
assert.equal(resolve(identity.directory).toLowerCase(),resolve(runtime,'data').toLowerCase())
const database=`employee_creation_p0_${Date.now()}`
await control.query(`create database ${database}`)
const a=new Client({...options,database}),b=new Client({...options,database})
const adapter={exec:sql=>a.query(sql),query:(sql,params)=>a.query(sql,params)}
const checks=[]
const saved=[]
const observe=promise=>promise.then(value=>({value}),error=>({error}))
const setup=async client=>client.query(`set test.uid='${admin}';set test.role='authenticated';set role authenticated;set statement_timeout='10s'`)
const create=(client,name,zkt,number=null)=>client.query("insert into employees(employee_number,active,first_name,last_name,plant_location,shift_type,hire_date,zkt_enabled) values($1,true,$2,'Fixture','NJ','day','2026-10-23',$3) returning id,employee_number,zkt_user_id,zkt_enabled,zkt_sync_status",[number,name,zkt])
const waitForLock=async client=>{
 for(let i=0;i<100;i++){
  if((await control.query('select wait_event_type from pg_stat_activity where pid=$1',[client.processID])).rows[0]?.wait_event_type==='Lock')return
  await new Promise(resolve=>setTimeout(resolve,20))
 }
 throw Error('Concurrent INSERT did not reach allocation lock')
}
try {
 await a.connect();await b.connect()
 await initializeCreationDb(adapter)
 const protectedSnapshot=async()=>({employees:(await a.query('select * from employees where id=any($1::uuid[]) order by id',[[peter,robert]])).rows,work:(await a.query('select * from employee_work_logs order by id')).rows,payroll:(await a.query('select * from employee_payments order by id')).rows,checks:(await a.query('select * from payroll_checks order by id')).rows,raw:(await a.query('select * from zkt_attendance_logs order by id')).rows})
 const before=await protectedSnapshot()
 await setup(a);await setup(b)
 assert.equal((await a.query('select next_available_employee_number() n')).rows[0].n,5)
 await a.query('begin');await b.query('begin')
 const first=(await create(a,'Race A requested ZKT',true)).rows[0]
 const pending=observe(create(b,'Race B without ZKT',false))
 await waitForLock(b);await a.query('commit')
 const other=await pending;assert.ifError(other.error)
 const second=other.value.rows[0];await b.query('commit')
 assert.deepEqual([first.employee_number,second.employee_number],[5,8])
 assert.notEqual(first.id,second.id)
 assert.equal(first.zkt_sync_status,'pending');assert.equal(first.zkt_enabled,false)
 assert.equal(second.zkt_sync_status,'disabled');assert.equal(second.zkt_enabled,false)
 saved.push(first,second);checks.push('two concurrent real PostgreSQL sessions assign distinct never-used numbers with all action/reuse flags OFF')
 await a.query('begin');await b.query('begin')
 saved.push((await create(a,'Explicit race winner',false,66)).rows[0])
 const duplicate=observe(create(b,'Explicit race loser',false,66))
 await waitForLock(b);await a.query('commit')
 assert.equal((await duplicate).error?.code,'23505');await b.query('rollback')
 checks.push('concurrent explicit duplicate rejected on server; one active profile and one reservation')
 for(const number of [1,2,3,4,6,7])await assert.rejects(create(a,'Retained number',false,number),error=>error.code==='23505')
 await assert.rejects(create(a,'   ',false),error=>error.code==='23514')
 await a.query("set test.uid='00000000-0000-0000-0000-000000000099'")
 await assert.rejects(create(a,'Non-admin denied',false),error=>error.code==='42501')
 await a.query(`set test.uid='${admin}'`)
 checks.push('server validation denies historical/terminal/raw identifiers, empty name and unauthorized role')
 await a.query(`reset role;create policy reject_new_employee on employees as restrictive for insert to authenticated with check(false);set role authenticated`)
 const freeBefore=(await a.query('select next_available_employee_number() n')).rows[0].n
 await assert.rejects(create(a,'RLS denial',true),error=>error.code==='42501')
 assert.equal((await a.query('select next_available_employee_number() n')).rows[0].n,freeBefore)
 await a.query('reset role;drop policy reject_new_employee on employees');await setup(a)
 checks.push('RLS denial rolls back the profile and does not consume/reserve a number')
 const fresh=new Client({...options,database});await fresh.connect()
 try{await setup(fresh);assert.deepEqual((await fresh.query('select id,employee_number,zkt_user_id,zkt_enabled,zkt_sync_status from employees where id=any($1::uuid[]) order by employee_number',[saved.map(row=>row.id)])).rows,saved);checks.push('committed profiles persist and can be read by a fresh authenticated database connection')}finally{await fresh.end()}
 // Inspect private queues/history as the local fixture owner, without granting
 // those tables to the authenticated creation role.
 await a.query('reset role')
 assert.equal((await a.query('select count(*)::int n from zkt_bridge_commands')).rows[0].n,0)
 assert.equal((await a.query('select count(*)::int n from employee_number_reservations where employee_number=66')).rows[0].n,1)
 assert.equal((await a.query('select count(*)::int n from (select employee_number from employees where active group by employee_number having count(*)>1) duplicates')).rows[0].n,0)
 assert.deepEqual(await protectedSnapshot(),before)
 assert.equal((await a.query("select count(*)::int n from employee_feature_flags where enabled and flag<>'former_employees_archive_readonly'")).rows[0].n,0)
 checks.push('old employees, Payroll, work logs and raw Attendance remain identical; no ZKT commands or flag enablement')
 const out={status:'PASS',database,engine:identity.version.split(' on ')[0],endpoint:'127.0.0.1:55439',syntheticOnly:true,saved,checks}
 if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(out,null,2))
 console.log(JSON.stringify(out))
}finally {
 await Promise.allSettled([a.query('rollback'),b.query('rollback')])
 await Promise.allSettled([a.end(),b.end(),control.end()])
}
