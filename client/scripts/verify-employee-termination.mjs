import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {initializeTerminationDb,admin,peter} from '../tests/helpers/employee-termination-db.mjs'
const runtime=resolve(process.argv[2]||'../../reports/phase2-postgres-runtime')
const {Client}=createRequire(resolve(runtime,'package.json'))('pg')
const options={host:'127.0.0.1',port:55439,user:'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
const control=new Client(options);await control.connect()
const identity=(await control.query("select current_user,current_setting('data_directory') directory,version() version")).rows[0]
assert.equal(identity.current_user,'phase2_local');assert.equal(resolve(identity.directory).toLowerCase(),resolve(runtime,'data').toLowerCase())
const database=`employee_termination_${Date.now()}`;await control.query(`create database ${database}`)
const a=new Client({...options,database}),b=new Client({...options,database})
const setup=client=>client.query(`set test.uid='${admin}';set test.role='authenticated';set role authenticated;set statement_timeout='10s'`)
const observe=p=>p.then(value=>({value}),error=>({error}))
async function waitForLock(){for(let i=0;i<100;i++){if((await control.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,20))}throw Error('Concurrent operation did not reach the lock')}
try{
 await a.connect();await b.connect();await initializeTerminationDb({exec:s=>a.query(s),query:(s,p)=>a.query(s,p)})
 const history=async()=>({work:(await a.query('select * from employee_work_logs order by id')).rows,payroll:(await a.query('select * from employee_payments order by id')).rows,checks:(await a.query('select * from payroll_checks order by id')).rows,raw:(await a.query('select * from zkt_attendance_logs order by id')).rows})
 const before=await history();await a.query('grant insert on employee_work_logs to authenticated');await setup(a);await setup(b)
 await a.query('begin');await b.query('begin')
 await a.query("select terminate_employee($1,'2025-01-02')",[peter])
 const concurrent=observe(b.query("select terminate_employee($1,'2025-01-02')",[peter]));await waitForLock();await a.query('commit')
 assert.match((await concurrent).error?.message||'',/already inactive/);await b.query('rollback')
 const fresh=(await b.query("insert into employees(employee_number,active,first_name,plant_location,hire_date,zkt_enabled) values(3,true,'New UUID fixture','NJ',current_date,false) returning id,employee_number")).rows[0]
 assert.notEqual(fresh.id,peter);assert.equal(fresh.employee_number,3)
 const nextEmployee=(await a.query('select id from employees where active is true and employee_number=1')).rows[0].id
 await a.query('begin');await a.query('select terminate_employee($1,current_date)',[nextEmployee])
 const writer=observe(b.query("insert into employee_work_logs(employee_id,work_date,time_in,time_out) values($1,current_date+1,'08:00','16:00')",[nextEmployee]))
 await waitForLock();await a.query('commit');assert.match((await writer).error?.message||'',/confirmed employment period|former employee|assignment start/)
 await a.query('reset role');assert.deepEqual(await history(),before)
 assert.equal((await a.query("select count(*)::int n from employee_integration_operations where employee_id=$1 and action='disable' and target='SACS'",[peter])).rows[0].n,1)
 assert.equal((await a.query('select count(*)::int n from(select employee_number from employees where active is true group by employee_number having count(*)>1)x')).rows[0].n,0)
 const out={status:'PASS',database,engine:identity.version.split(' on ')[0],syntheticOnly:true,checks:['concurrent terminations serialize; only one archive operation','new UUID may use former HR number without old history','concurrent post-termination work insert waits and is rejected','old work/payroll/checks/raw datasets unchanged','SACS disable is queued once for old UUID; no duplicate active numbers']}
 if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(out,null,2));console.log(JSON.stringify(out))
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([a.end(),b.end(),control.end()])}
