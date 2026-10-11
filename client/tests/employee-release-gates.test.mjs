import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {identityDb,peter} from './helpers/employee-identity-db.mjs'

test('release migration keeps actions and reuse OFF and rejects bypass RPC',async()=>{
 const db=await identityDb()
 try {
  await db.exec(await readFile(new URL('../../supabase/employee_release_gates.sql',import.meta.url),'utf8'))
  assert.equal((await db.query('select actions_enabled from employee_release_config')).rows[0].actions_enabled,false)
  assert.equal((await db.query('select reuse_enabled from employee_number_config')).rows[0].reuse_enabled,false)
  await assert.rejects(db.query("select change_employee_employment($1,'terminate','2024-01-03')",[peter]),/gate is OFF/)
  await assert.rejects(db.exec('update employee_number_config set reuse_enabled=true'),/eight current/)
  await db.exec("set role authenticated")
  await assert.rejects(db.exec('update employee_release_config set actions_enabled=true'),/permission denied/)
  await assert.rejects(db.query("select change_employee_employment_pre_release($1,'terminate','2024-01-03',null,null)",[peter]),/permission denied/)
  await db.exec('reset role')
  assert.equal((await db.query('select active from employees where id=$1',[peter])).rows[0].active,true)
 }finally{await db.close()}
})

test('reuse needs all eight matching, current confirmations and expires fail closed',async()=>{
 const db=await identityDb()
 try {
  await db.exec(await readFile(new URL('../../supabase/employee_release_gates.sql',import.meta.url),'utf8'))
  await db.exec(`insert into employee_release_evidence select gate,now(),now()+interval '1 hour',repeat('a',40),'Synthetic local test evidence' from unnest(array['nj_physical','pa_physical','historical_uuid','live_sacs','backup_restore','database_migrations','concurrency']) gate`)
  await assert.rejects(db.exec('update employee_number_config set reuse_enabled=true'),/eight current/)
  await db.exec("insert into employee_release_evidence values('rollback',now(),now()+interval '1 hour',repeat('b',40),'Synthetic rollback evidence')")
  await assert.rejects(db.exec('update employee_number_config set reuse_enabled=true'),/eight current/)
  await db.exec("update employee_release_evidence set candidate_commit=repeat('a',40)")
  await db.exec('update employee_number_config set reuse_enabled=true')
  await db.exec("update employee_release_evidence set verified_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where gate='rollback'")
  await assert.rejects(db.query('select next_available_employee_number()'),/missing or expired/)
  await assert.rejects(db.query('update employees set employee_number=employee_number where id=$1',[peter]),/missing or expired/)
 }finally{await db.close()}
})
