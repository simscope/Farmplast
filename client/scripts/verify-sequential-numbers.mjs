// Native PostgreSQL verification. Never connects to a remote/production database.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {formerThreeFixture,admin,peter} from '../tests/helpers/employee-sequential-db.mjs'
const runtime=resolve(process.argv[2]||'../../reports/phase2-postgres-runtime')
const {Client}=createRequire(resolve(runtime,'package.json'))('pg')
const options={host:'127.0.0.1',port:55439,user:'phase2_local',database:'postgres',connectionTimeoutMillis:5000}
const control=new Client(options);await control.connect()
const identity=(await control.query("select current_user,current_setting('data_directory') directory,version() version")).rows[0]
assert.equal(identity.current_user,'phase2_local')
assert.equal(resolve(identity.directory).toLowerCase(),resolve(runtime,'data').toLowerCase())
const database=`employee_sequential_${Date.now()}`
await control.query(`create database ${database}`)
const a=new Client({...options,database}),b=new Client({...options,database})
const setup=client=>client.query(`set test.uid='${admin}';set test.role='authenticated';set role authenticated;set statement_timeout='10s'`)
const create=(client,name,selected=null,zkt=true)=>client.query(`insert into employees(employee_number,active,first_name,plant_location,hire_date,zkt_enabled)
 values($1,true,$2,'NJ',(now() at time zone 'America/New_York')::date,$3) returning id,employee_number,zkt_user_id,zkt_sync_status,zkt_sync_error`,[selected,name,zkt])
const observe=promise=>promise.then(value=>({value}),error=>({error}))
const waitForLock=async()=>{for(let n=0;n<100;n++){
 if((await control.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock')return
 await new Promise(resolve=>setTimeout(resolve,20))
}throw Error('Second transaction did not reach allocation lock')}
try {
 await a.connect();await b.connect();await formerThreeFixture({exec:sql=>a.query(sql),query:(sql,params)=>a.query(sql,params)})
 const snapshot=async()=>({old:(await a.query('select * from employees where id=$1',[peter])).rows,work:(await a.query('select * from employee_work_logs order by id')).rows,payroll:(await a.query('select * from employee_payments order by id')).rows,checks:(await a.query('select * from payroll_checks order by id')).rows,raw:(await a.query('select * from zkt_attendance_logs order by id')).rows})
 const before=await snapshot()
 await setup(a);await setup(b)
 assert.equal((await a.query('select next_available_employee_number() n')).rows[0].n,3)
 await a.query('begin');await b.query('begin')
 const selected=(await create(a,'Selected former three',3)).rows[0]
 const loser=observe(create(b,'Concurrent same selection',3));await waitForLock();await a.query('commit')
 const rejected=await loser;assert.equal(rejected.error?.code,'23505');assert.match(rejected.error.message,/Next free Employee Number: 4/);await b.query('rollback')
 const retry=(await create(b,'Retry with selected four',4,false)).rows[0]
 assert.equal(retry.employee_number,4)
 const manual=(await create(a,'Manual twenty',20,false)).rows[0];assert.equal(manual.employee_number,20)
 assert.equal((await a.query('select next_available_employee_number() n')).rows[0].n,5)
 await a.query('begin');await b.query('begin')
 const auto=(await create(a,'Automatic five')).rows[0]
 const pending=observe(create(b,'Automatic six'));await waitForLock();await a.query('commit')
 const other=await pending;assert.ifError(other.error);await b.query('commit')
 assert.deepEqual([auto.employee_number,other.value.rows[0].employee_number],[5,6])
 const fresh=new Client({...options,database});await fresh.connect()
 try{await setup(fresh);const saved=(await fresh.query('select employee_number,zkt_user_id from employees where id=any($1::uuid[]) order by employee_number',[[selected.id,retry.id,manual.id,auto.id,other.value.rows[0].id]])).rows;assert.deepEqual(saved.map(x=>x.employee_number),[3,4,5,6,20]);assert.ok(saved.every(x=>x.employee_number===x.zkt_user_id))}finally{await fresh.end()}
 await a.query('reset role');assert.deepEqual(await snapshot(),before)
 assert.equal((await a.query('select count(*)::int n from (select employee_number from employees where active is true group by employee_number having count(*)>1) x')).rows[0].n,0)
 assert.equal((await a.query("select count(*)::int n from zkt_bridge_commands where command='identity_activate_employee'")).rows[0].n,0)
 const flags=(await a.query('select flag,enabled from employee_feature_flags order by flag')).rows
 assert.ok(flags.every(f=>f.enabled===(f.flag==='former_employees_archive_readonly')))
 const out={status:'PASS',engine:identity.version.split(' on ')[0],database,syntheticOnly:true,checks:['former 3 reused by new UUID','concurrent chosen 3 rejected with next free 4','manual 20 preserved','concurrent automatic allocation returns 5 and 6','fresh connection sees persisted selected numbers','old employees/work/payroll/raw unchanged','ZKT offline does not block profiles or claim sync success','Archive ON; lifecycle/reuse UI OFF'],flags}
 if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(out,null,2))
 console.log(JSON.stringify(out))
}finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([a.end(),b.end(),control.end()])}
