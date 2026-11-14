'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dispatch,config}=require('../src/core.cjs');
const {localTimestamp,importAttendance:linuxImport}=require('../linux/common-import.cjs');
const cfg={...config({ZKT_IP:'127.0.0.1',ZKT_IDENTITY_DEVICE_KEY:'nj',ZKT_EXPECTED_SERIAL_NUMBER:'NJ-SERIAL',ZKT_COMMON_ATTENDANCE:'true'}),autoHours:[],batch:2};
const users=[1,4,9].map(n=>({id:String(n),name:`Person ${n}`,enabled:true}));
const logs=users.map(u=>({deviceUserId:u.id,timestamp:'2026-11-13 08:00:00'}));
test('one NJ import covers all employees with verified readback before shared batches',async()=>{
 const calls=[];const db={confirmAssignments:async(k,s,u)=>{assert.equal(u,users);calls.push('confirm');return {accepted:3}},
  importBatch:async(k,s,e)=>{calls.push(e.map(x=>x.deviceUserId).join(','));return {inserted:e.length,skipped:0}},processAttendance:async()=>{calls.push('process');return {ok:true}}};
 const result=await dispatch({command:'pull_attendance',payload:{}},{cfg,db,now:()=>Date.parse('2026-11-13T22:00Z'),sdk:async r=>{
  assert.equal(r.readOnly,true);assert.equal(r.includeUsers,true);assert.equal(r.expectedSerialNumber,'NJ-SERIAL');return {ok:true,serialNumber:'NJ-SERIAL',users,logs};
 }});assert.equal(result.inserted,3);assert.deepEqual(calls,['confirm','1,4','9','process']);
});
test('requested reused number can sync and becomes confirmed only after exact SDK identity readback',async()=>{
 let confirmed=0,status=0;
 const db={employee:async()=>({id:'new',employee_number:4,plant_location:'NJ',zkt_user_id:4,active:true,zkt_enabled:false,zkt_sync_status:'pending',first_name:'New',last_name:'Person'}),validateAssignment:async()=>{},
  confirmAssignments:async()=>{confirmed++;return {accepted:1}},employeeStatus:async()=>{status++}};
 const sdk=async r=>{assert.equal(r.verifyUser,true);return {ok:true,serialNumber:'NJ-SERIAL',readBackVerified:true,userId:'4',name:'New Person',enabled:true}};
 await dispatch({command:'sync_one_employee',payload:{employee_id:'new'}},{cfg,db,sdk});assert.equal(confirmed,1);assert.equal(status,1);
 await assert.rejects(dispatch({command:'sync_one_employee',payload:{employee_id:'new'}},{cfg,db,sdk:async()=>({ok:true,serialNumber:'NJ-SERIAL',readBackVerified:true,userId:'4',name:'Old Person',enabled:true})}),/readback/);
 assert.equal(confirmed,1);
 const wrongPlant={...db,employee:async()=>({...await db.employee(),plant_location:'PA'})};
 await assert.rejects(dispatch({command:'sync_one_employee',payload:{employee_id:'new'}},{cfg,db:wrongPlant,sdk:()=>assert.fail('Different-plant employee must never reach SDK')}),/different plant/);
});
test('PA shares the same RPC path and preserves NY winter/summer conversion for every identifier',async()=>{
 assert.equal(localTimestamp('2026-11-13T13:00:00Z'),'2026-11-13 08:00:00');
 assert.equal(localTimestamp('2026-07-13T12:00:00Z'),'2026-07-13 08:00:00');
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='confirm_zkt_assignment_readback'?{accepted:2}:name==='ingest_zkt_attendance_batch'?{inserted:2,skipped:0}:{ok:true},error:null}}};
 const result=await linuxImport(client,[100,104].map(n=>({deviceUserId:String(n),recordTime:'2026-11-13T13:00:00Z'})),{deviceKey:'pa',serialNumber:'PA-SERIAL',users:[]},x=>x,r=>r.deviceUserId);
 assert.equal(result.inserted,2);assert.deepEqual(calls.map(c=>c.name),['confirm_zkt_assignment_readback','ingest_zkt_attendance_batch','process_zkt_attendance_to_work_logs']);
 assert.deepEqual(calls[1].args.p_events.map(e=>e.deviceUserId),['100','104']);
});
