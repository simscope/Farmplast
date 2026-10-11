import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {createSafetyHistoryReader} from '../server/employeeSafetyHistory.mjs'
import {createHistoryHandler} from '../../supabase/sacs/functions/employee-history/handler.mjs'
const source='11111111-1111-4111-8111-111111111111',replacement='22222222-2222-4222-8222-222222222222',company='33333333-3333-4333-8333-333333333333'
test('SACS history resolves archived source UUID and cannot transfer sessions on number reuse',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create function auth.role() returns text language sql as $$select 'service_role'::text$$;
      create table farmplast_sync_config(singleton boolean,company_id uuid,enabled boolean);insert into farmplast_sync_config values(true,'${company}',true);
      create table employees(id uuid primary key,company_id uuid,source_system text,source_employee_id uuid,trade_group text,employee_number text);
      insert into employees values('${source}','${company}','farmplast','${source}','General','3'),('${replacement}','${company}','farmplast','${replacement}','General','3');
      create table training_modules(id uuid,title text,code text);insert into training_modules values('${source}','Safety check','check');
      create table daily_sessions(id uuid,module_id uuid,company_id uuid,employee_id uuid,status text,session_date date,started_at timestamptz,completed_at timestamptz,score numeric,passed boolean);
      insert into daily_sessions values('${source}','${source}','${company}','${source}','completed','2024-01-01','2024-01-01T12:00Z','2024-01-01T12:10Z',100,true);
      create table company_training_one_time_assignments(id uuid,company_id uuid,employee_id uuid,module_family_key text,assigned_at timestamptz,completed_at timestamptz,cancelled_at timestamptz,completed_session_id uuid);
      create table company_training_group_assignments(id uuid,module_id uuid,company_id uuid,trade_group text,created_at timestamptz);`)
    await db.exec(await readFile(new URL('../../supabase/sacs/employee_history.sql',import.meta.url),'utf8'))
    const read=async id=>(await db.query('select farmplast_employee_safety_history($1) history',[id])).rows[0].history
    assert.equal((await read(source)).records[0].title,'Safety check');assert.equal((await read(replacement)).records.length,0)
    await db.exec('set role authenticated');await assert.rejects(db.query('select farmplast_employee_safety_history($1)',[source]),/permission denied/)
  }finally{await db.close()}
})
test('history proxy rejects manager and caller-selected company; verifies upstream durable identity',async()=>{
  let isAdmin=true,archiveEnabled=true,calls=0
  const client={auth:{getUser:async()=>({data:{user:{id:source}}})},rpc:async name=>({data:name==='employee_feature_flags_status'?{former_employees_archive_readonly:archiveEnabled}:isAdmin}),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:source}})})})})}
  const read=createSafetyHistoryReader({clientForToken:()=>client,secret:'x'.repeat(32),url:'https://sacs.invalid/history',fetchImpl:async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).source_employee_id,source);return Response.json({source_employee_id:source,records:[],assignments:[],group_assignments:[],next_offset:null})}})
  assert.equal((await read({method:'POST',body:{employee_id:source}})).status,401)
  assert.equal((await read({method:'POST',authorization:'Bearer test',body:{employee_id:source,company_id:company}})).status,400)
  isAdmin=false;assert.equal((await read({method:'POST',authorization:'Bearer test',body:{employee_id:source}})).status,403);assert.equal(calls,0)
  isAdmin=true;archiveEnabled=false;assert.equal((await read({method:'POST',authorization:'Bearer test',body:{employee_id:source}})).body.error,'archive_disabled');assert.equal(calls,0)
  archiveEnabled=true
  isAdmin=true;assert.equal((await read({method:'POST',authorization:'Bearer test',body:{employee_id:source}})).status,200)
  const bad=createSafetyHistoryReader({clientForToken:()=>client,secret:'x'.repeat(32),url:'https://sacs.invalid/history',fetchImpl:async()=>Response.json({source_employee_id:replacement,records:[],assignments:[],group_assignments:[]})})
  assert.equal((await bad({method:'POST',authorization:'Bearer test',body:{employee_id:source}})).status,502)
})
test('SACS history endpoint rejects wrong secret, arbitrary company and oversize payload',async()=>{
  const handler=createHistoryHandler({secret:'x'.repeat(32),read:async id=>({source_employee_id:id,records:[]})})
  const request=(body,secret='x'.repeat(32))=>new Request('https://sacs.invalid',{method:'POST',headers:{'x-farmplast-sync-secret':secret},body:JSON.stringify(body)})
  assert.equal((await handler(request({source_employee_id:source},'wrong'))).status,401)
  assert.equal((await handler(request({source_employee_id:source,company_id:company}))).status,400)
  assert.equal((await handler(request({source_employee_id:source,offset:0}))).status,200)
  assert.equal((await handler(request({source_employee_id:source,extra:'x'.repeat(2100)}))).status,413)
})
