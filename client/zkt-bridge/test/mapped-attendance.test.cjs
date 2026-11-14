'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scope,collect}=require('../src/mapped-attendance.cjs');
const cfg={deviceKey:'nj',serialNumber:'NJ-SERIAL',plant:'NJ',ip:'127.0.0.1',port:4370,machine:1,batch:2,childMs:1000};
const env={ZKT_MAPPED_TERMINAL_USER_IDS:'1',ZKT_MAPPED_LOCAL_FROM:'2026-11-13 00:00:00'};
function fixture({serial='NJ-SERIAL',busy=false,registered=true}={}) {
 const calls=[];
 const result=data=>({abortSignal:async()=>({data,error:null})});
 const client={from(table){
  if(table==='zkt_identity_devices')return {select:()=>({eq:()=>({single:()=>result({verified:registered,serial_number:'NJ-SERIAL',plant_location:'NJ'})})})};
  assert.equal(table,'zkt_bridge_commands');return {select:()=>({eq:()=>({limit:()=>result(busy?[{id:'busy'}]:[])})})};
 },rpc(name,args){calls.push({name,args});return result(name==='ingest_zkt_identity_events'?{owned:args.p_events.length,review:0}:{ok:true})}};
 const sdk=async request=>{assert.equal(request.readOnly,true);assert.equal(request.expectedSerialNumber,'NJ-SERIAL');assert.ok(['test','pull_attendance'].includes(request.operation));
  return {ok:true,serialNumber:serial,logs:[{deviceUserId:'1',timestamp:'2026-11-12 08:00:00'},{deviceUserId:'2',timestamp:'2026-11-13 08:00:00'},
   {deviceUserId:'1',timestamp:'2026-11-13 08:23:47',inOutMode:255},{deviceUserId:'1',timestamp:'2026-11-13 16:43:35',inOutMode:255},{deviceUserId:'1',timestamp:'invalid'}]};
 };
 return {client,sdk,calls};
}
test('mapped companion filters prior history and other employees and leaves the command queue untouched',async()=>{
 const f=fixture();const result=await collect({...f,cfg,env,signal:new AbortController().signal});
 assert.equal(result.matched,2);assert.equal(result.owned,2);
 assert.deepEqual(f.calls.map(c=>c.name),['ingest_zkt_identity_events','process_zkt_attendance_to_work_logs']);
 assert.deepEqual(f.calls[0].args.p_events.map(r=>r.timestamp),['2026-11-13 08:23:47','2026-11-13 16:43:35']);
});
test('probe reads device identity without importing or processing any attendance',async()=>{
 const f=fixture();assert.equal((await collect({...f,cfg,env,probe:true,signal:new AbortController().signal})).readOnly,true);assert.equal(f.calls.length,0);
});
test('wrong serial, unverified device, busy worker, or missing scope fails closed',async()=>{
 for(const options of [{serial:'OTHER'},{registered:false},{busy:true}]) {
  const f=fixture(options);await assert.rejects(collect({...f,cfg,env,signal:new AbortController().signal}));assert.equal(f.calls.length,0);
 }
 assert.throws(()=>scope({}),/Explicit/);assert.throws(()=>scope({...env,ZKT_MAPPED_TERMINAL_USER_IDS:'1;DELETE'}),/Explicit/);
 assert.throws(()=>scope({...env,ZKT_MAPPED_LOCAL_FROM:'2026-11-13 08:00:00'}),/Explicit/);
});
