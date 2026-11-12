import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../reports/phase5-postgres-runtime/package.json',import.meta.url)),{Client}=require('pg');
const name=process.argv[2];if(!name?.startsWith('reuse_copy_'))throw Error('Only isolated reuse_copy_* on loopback permitted');
const d=new Client({host:'127.0.0.1',port:55441,user:'phase5_local',database:name});await d.connect();const out={};
const q=(s,p)=>d.query(s,p),baselineSql=fs.readFileSync('docs/operations/farmplast-remediation-data-baseline.sql','utf8');
const baseline=async()=> (await q(baselineSql)).rows[0].evidence;
try{
 await q('BEGIN');const before=await baseline();const admin=(await q("select id from profiles where role='admin' limit 1")).rows[0];
 await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[admin.id,JSON.stringify({sub:admin.id,role:'service_role'})]);
 const oldPresence=(await q('select id,last_punch_time,last_punch_type,presence_status,last_work_date from v_employee_current_presence order by id')).rows;
 assert.equal((await q('select count(*)::int n from list_former_employees()')).rows[0].n,8);
 const A=crypto.randomUUID(),B=crypto.randomUUID(),N=crypto.randomUUID(),C=crypto.randomUUID(),U=crypto.randomUUID();
 // Seed synthetic pre-existing lifecycle states only on this disposable copy.
 // Restore origin before every import/processing assertion: real attendance guards remain active.
 await q("SET LOCAL session_replication_role='replica'");
 for(const [id,num,active,shift,hire,term] of [[A,900015,false,'day','2026-10-01','2026-10-06'],[B,900015,true,'day','2026-10-07',null],[N,900016,true,'night','2026-10-01',null],[C,900017,true,'day','2026-10-01',null],[U,900099,true,'day','2026-10-01',null]]){
  await q("insert into employees(id,employee_number,first_name,last_name,active,shift_type,hire_date,termination_date,hourly_rate,default_lunch_hours) values($1,$2,'Isolated','Fixture',$3,$4,$5,$6,20,.5)",[id,num,active,shift,hire,term]);
  await q("insert into employee_employment_periods(employee_id,employee_number,hire_date,termination_date,legacy_inactive,recorded_at) values($1,$2,$3,$4,false,'2026-10-01')",[id,num,hire,term]);
 }
 await q("SET LOCAL session_replication_role='origin'");
 await q("insert into zkt_identity_devices(device_key,plant_location,serial_number,verified,inventory_verified) values('FIX-NJ','NJ','FIX-NJ-SERIAL',true,true),('FIX-PA','PA','FIX-PA-SERIAL',true,true)");
 const period=async id=>(await q('select id from employee_employment_periods where employee_id=$1',[id])).rows[0].id;
 const pa=await period(A),pb=await period(B),pn=await period(N),pc=await period(C);
 const mapping=async(device,number,id,p,from,to,shift='day')=>q("insert into zkt_identifier_history(device_key,terminal_user_id,employee_id,period_id,valid_from,valid_to,evidence,shift_type,hourly_rate,default_lunch_hours,processing_verified) values($1,$2,$3,$4,$5,$6,'Isolated verified fixture',$7,20,.5,true)",[device,String(number),id,p,from,to,shift]);
 await mapping('FIX-NJ',900015,A,pa,'2026-10-01T04:00Z','2026-10-07T04:00Z');
 await mapping('FIX-NJ',900015,B,pb,'2026-10-07T16:00Z',null);
 await mapping('FIX-NJ',900016,N,pn,'2026-10-01T04:00Z',null,'night');
 await mapping('FIX-NJ',900017,C,pc,'2026-10-01T04:00Z',null);
 await mapping('FIX-PA',900015,C,pc,'2026-10-01T04:00Z',null);
 const event=(number,stamp,mode=0,extra={})=>({deviceUserId:String(number),userId:String(number),timestamp:stamp,verifyMode:1,inOutMode:mode,workCode:0,...extra});
 const ingest=async(events,device='FIX-NJ')=>{await q('SET LOCAL ROLE service_role');const result=await q('select ingest_zkt_identity_events($1,$2,$3::jsonb)',[device,device+'-SERIAL',JSON.stringify(events)]);await q('RESET ROLE');return result;};
 const process=async()=>{await q('SET LOCAL ROLE service_role');const result=await q('select process_zkt_attendance_to_work_logs()');await q('RESET ROLE');return result;};
 const work=async(id,date)=>(await q('select * from employee_work_logs where employee_id=$1 and work_date=$2',[id,date])).rows[0];
 const counts=async()=>(await q('select (select count(*) from zkt_identity_events)::int events,(select count(*) from zkt_identity_review)::int review,(select count(*) from employee_work_logs)::int work')).rows[0];
 await q("insert into employee_work_logs(employee_id,work_date,time_in,time_out,lunch_hours,reg_hours,labor_amount,source,approved) values($1,'2026-10-05','07:00','16:00',.5,8.5,170,'zkt',true)",[A]);
 const oldA=JSON.stringify(await work(A,'2026-10-05'));
 assert.equal((await q('select count(*)::int n from employee_work_logs where employee_id=$1',[B])).rows[0].n,0);
 // Before exact employment timestamp: no B ownership or hours.
 await ingest([event(900015,'2026-10-07 11:59:00')]);await process();assert.equal(await work(B,'2026-10-07'),undefined);
 assert.equal((await q("select count(*)::int n from zkt_event_ownership o join zkt_identity_events e on e.id=o.event_id where o.employee_id=$1 and e.local_timestamp='2026-10-07 11:59'",[B])).rows[0].n,0);
 await ingest([event(900015,'2026-10-07 13:00:00'),event(900015,'2026-10-07 17:00:00',1)]);
 const patchedProcessor=(await q("select pg_get_functiondef('public.process_zkt_attendance_to_work_logs()'::regprocedure) def")).rows[0].def;
 const rollbackDefinitions=fs.readFileSync('supabase/zkt_identity_attendance_integration_rollback.sql','utf8');
 await q(rollbackDefinitions.slice(rollbackDefinitions.indexOf('CREATE OR REPLACE FUNCTION public.process_zkt_attendance_to_work_logs'),rollbackDefinitions.indexOf('CREATE OR REPLACE VIEW')));
 await process();assert.equal(await work(B,'2026-10-07'),undefined);out.before_patch_gap_reproduced='PASS';
 await q(patchedProcessor);await process();let w=await work(B,'2026-10-07');assert.equal(Number(w.reg_hours),3.5);out.reused_number_clean_history='PASS';
 await ingest([event(900015,'2026-10-08 07:00:00')]);await process();w=await work(B,'2026-10-08');assert.equal(w.time_out,null);
 await q("select set_config('farmplast.zkt_identity_processing','on',true)");await q('update employee_work_logs set downtime_hours=.5 where id=$1',[w.id]);await q("select set_config('farmplast.zkt_identity_processing','off',true)");
 await ingest([event(900015,'2026-10-08 16:00:00',1)]);await process();w=await work(B,'2026-10-08');assert.equal(w.time_in,'07:00:00');assert.equal(w.time_out,'16:00:00');assert.equal(Number(w.reg_hours),8);assert.equal(Number(w.lunch_hours),.5);assert.equal(Number(w.downtime_hours),.5);out.normal_in_out='PASS';out.lunch_downtime='PASS';
 const closed=JSON.stringify(w),repeatBefore=await counts();await ingest([event(900015,'2026-10-08 16:00:00',1,{transportRetry:2})]);await process();assert.deepEqual(await counts(),repeatBefore);assert.equal(JSON.stringify(await work(B,'2026-10-08')),closed);out.repeat_processor='PASS';
 await ingest([event(900015,'2026-10-05 07:00:00'),event(900015,'2026-10-05 16:00:00',1)]);await process();const oldBefore=await counts();await ingest([event(900015,'2026-10-05 07:00:00'),event(900015,'2026-10-05 16:00:00',1)]);await process();assert.deepEqual(await counts(),oldBefore);assert.equal(JSON.stringify(await work(A,'2026-10-05')),oldA);assert.equal(await work(B,'2026-10-05'),undefined);out.old_event_replay='PASS';
 await ingest([event(900016,'2026-10-09 19:00:00',255),event(900016,'2026-10-10 07:00:00',255)]);await process();w=await work(N,'2026-10-09');assert.equal(w.time_in,'19:00:00');assert.equal(w.time_out,'07:00:00');assert.equal(Number(w.reg_hours),11.5);out.night_shift='PASS';
 const same=event(900015,'2026-10-10 07:00:00');await ingest([same,event(900015,'2026-10-10 16:00:00',1)]);await ingest([same,event(900015,'2026-10-10 16:00:00',1)],'FIX-PA');await process();assert.equal((await work(B,'2026-10-10')).employee_id,B);assert.equal((await work(C,'2026-10-10')).employee_id,C);out.distinct_terminals_same_number_time='PASS';
 // Legacy replay with proven device identity reuses the existing identity row.
 const legacy=event(900017,'2026-10-11 07:00:00');const raw=(await q("insert into zkt_attendance_logs(employee_number,punch_time,raw) values(900017,'2026-10-11T11:00Z',$1) returning id",[JSON.stringify(legacy)])).rows[0];
 const legacyId=(await q('select id from zkt_identity_events where legacy_raw_id=$1',[raw.id])).rows[0].id;
 await q("insert into zkt_legacy_device_evidence(event_id,device_key,evidence,confirmed_by) values($1,'FIX-NJ','Isolated verified fixture',$2)",[legacyId,admin.id]);
 const dualBefore=await counts();await ingest([legacy]);await process();assert.deepEqual(await counts(),dualBefore);out.legacy_identity_verified_duplicate='PASS';
 // A native OUT can close a proven legacy IN through the same UUID/day processor.
 await ingest([event(900017,'2026-10-11 16:00:00',1)]);await process();assert.equal((await work(C,'2026-10-11')).time_out,'16:00:00');out.mixed_legacy_in_native_out='PASS';
 // Reverse delivery order must also preserve the single day and accept later OUT.
 const reverse=event(900015,'2026-10-08 07:00:00');const reverseRaw=(await q("insert into zkt_attendance_logs(employee_number,punch_time,raw) values(900015,'2026-10-08T11:00Z',$1) returning id",[JSON.stringify(reverse)])).rows[0];
 const reverseId=(await q('select id from zkt_identity_events where legacy_raw_id=$1',[reverseRaw.id])).rows[0].id;
 await q("insert into zkt_legacy_device_evidence(event_id,device_key,evidence,confirmed_by) values($1,'FIX-NJ','Isolated verified fixture',$2)",[reverseId,admin.id]);await ingest([reverse]);await process();assert.equal(JSON.stringify(await work(B,'2026-10-08')),closed);assert.equal((await q('select count(*)::int n from zkt_native_attendance_input() where employee_id=$1 and work_date=\'2026-10-08\'',[B])).rows[0].n,2);out.native_then_legacy='PASS';
 // Missing device evidence: retain one review event, never guess owner or hours.
 const unknown=event(900015,'2026-10-09 07:00:00');await q("insert into zkt_attendance_logs(employee_number,punch_time,raw) values(900015,'2026-10-09T11:00Z',$1)",[JSON.stringify(unknown)]);
 const ambiguousBefore=await counts();await ingest([unknown]);await process();const ambiguousAfter=await counts();assert.equal(ambiguousAfter.events,ambiguousBefore.events+1);assert.equal(ambiguousAfter.review,ambiguousBefore.review+1);assert.equal(await work(B,'2026-10-09'),undefined);
 await ingest([unknown]);await process();assert.deepEqual(await counts(),ambiguousAfter);out.legacy_device_unknown_quarantine='PASS';
 await ingest([event(900015,'2026-10-06 17:00:00',1)]);await process();assert.equal(await work(B,'2026-10-06'),undefined);assert.equal(JSON.stringify(await work(A,'2026-10-05')),oldA);out.delayed_old_event='PASS';
 await ingest([event(900099,'2026-10-10 07:00:00')]);await process();assert.equal((await q("select count(*)::int n from zkt_event_ownership o join zkt_identity_events e on e.id=o.event_id where e.terminal_user_id='900099'")).rows[0].n,0);assert.equal((await q('select presence_status from v_employee_current_presence where id=$1',[U])).rows[0].presence_status,'UNKNOWN');assert.equal(await work(U,'2026-10-10'),undefined);out.unknown_ownership='PASS';
 const after=await baseline();for(const k of ['payments','payroll_checks','deductions'])assert.deepEqual(after[k],before[k]);out.payroll_history='PASS';
 const originalPresence=(await q('select id,last_punch_time,last_punch_type,presence_status,last_work_date from v_employee_current_presence where id<>all($1::uuid[]) order by id',[[A,B,N,C,U]])).rows;assert.deepEqual(originalPresence,oldPresence);out.existing_presence='PASS';
 await q('SAVEPOINT access_check');await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:crypto.randomUUID(),role:'authenticated'}),crypto.randomUUID()]);await q('SET LOCAL ROLE authenticated');
 assert.equal((await q('select count(*)::int n from zkt_native_attendance_input() where employee_id=$1',[A])).rows[0].n,0);await q('ROLLBACK TO SAVEPOINT access_check');out.non_admin_former_isolation='PASS';
 await q('SAVEPOINT anon_check');await q('SET LOCAL ROLE anon');let denied=false;try{await q('select * from zkt_native_attendance_input()');}catch(e){assert.equal(e.code,'42501');denied=true;}assert.equal(denied,true);await q('ROLLBACK TO SAVEPOINT anon_check');out.anonymous_denied='PASS';
 await q('ROLLBACK');const restored=await baseline();for(const k of ['employees','payments','payroll_checks','deductions','work_logs','attendance'])assert.deepEqual(restored[k],before[k]);out.original_history='PASS';out.result='PASS';
 await q(fs.readFileSync('supabase/zkt_identity_attendance_integration_rollback.sql','utf8'));const rollback=await baseline();for(const k of ['employees','payments','payroll_checks','deductions','work_logs','attendance'])assert.deepEqual(rollback[k],before[k]);out.definition_rollback='PASS';
 await q(fs.readFileSync('supabase/zkt_identity_attendance_integration.sql','utf8'));out.reapply_after_rollback='PASS';
}catch(e){await q('ROLLBACK').catch(()=>{});out.result='FAIL';out.error=e.message;out.stack=e.stack;process.exitCode=1;}finally{await d.end();console.log(JSON.stringify(out));}
