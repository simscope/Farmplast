import test from 'node:test';
import assert from 'node:assert/strict';
import { createSacsCaller, toSacsEmployee, validSelection } from '../server/sacsSync.mjs';
import { runEmployeeSyncTargets } from '../src/utils/employeeSyncTargets.js';
const first={id:'11111111-1111-4111-8111-111111111111',employee_number:1,first_name:'Current',last_name:'Worker',phone:null,email:null,position:'worker',active:true,zkt_enabled:true,plant_location:'NJ',zkt_password:'must-not-send',hourly_rate:42};
const roster=[first,{...first,id:'22222222-2222-4222-8222-222222222222',employee_number:2,plant_location:'PA'},{...first,id:'33333333-3333-4333-8333-333333333333',employee_number:3,active:false},{...first,id:'44444444-4444-4444-8444-444444444444',employee_number:4,zkt_enabled:false}];
function fakeClient(authorized=true){return {auth:{getUser:async()=>({data:{user:authorized?{id:'operator'}:null},error:null})},from(){const filters=[];const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},order(){return chain},async limit(){return {data:roster.filter(e=>filters.every(([k,v])=>e[k]===v)),error:null}}};return chain}}}
test('NJ and PA bulk use the correct active ZKT-enabled plant population and allowlist payload',async()=>{
 for(const plant of ['NJ','PA']){
  let sent;
  const caller=createSacsCaller({enabled:true,secret:'server-only',url:'https://sacs.test/sync',clientForToken:()=>fakeClient(),fetchImpl:async(_url,options)=>{
   sent=JSON.parse(options.body).employees;
   assert.equal(options.headers['x-farmplast-sync-secret'],'server-only');
   return {ok:true,json:async()=>({synced:sent.length,failed:0,results:sent.map(e=>({source_employee_id:e.source_employee_id,status:'updated'}))})};
  }});
  const result=await caller({method:'POST',authorization:'Bearer token',body:{plant_location:plant}});
  assert.equal(result.status,200);assert.equal(sent.length,1);assert.equal(sent[0].source_employee_id,plant==='NJ'?first.id:roster[1].id);
  assert.deepEqual(Object.keys(sent[0]).sort(),['source_employee_id','employee_number','full_name','phone','email','position','is_active'].sort());
 }
});
test('single inactive employee can deactivate SACS independently of ZKT eligibility',async()=>{
 let sent;
 const caller=createSacsCaller({enabled:true,secret:'server',url:'https://sacs.test',clientForToken:()=>fakeClient(),fetchImpl:async(_u,o)=>{
  sent=JSON.parse(o.body).employees;return {ok:true,json:async()=>({synced:1,failed:0,results:[{source_employee_id:sent[0].source_employee_id,status:'updated'}]})};
 }});
 assert.equal((await caller({method:'POST',authorization:'Bearer token',body:{employee_id:roster[2].id}})).status,200);
 assert.equal(sent[0].is_active,false);
});
test('caller rejects unauthenticated requests and caller-selected roster/company',async()=>{
 const caller=createSacsCaller({enabled:true,secret:'server',url:'https://sacs.test',clientForToken:()=>fakeClient(false),fetchImpl:()=>{throw Error('must not send')}});
 assert.equal((await caller({method:'POST',body:{plant_location:'NJ'}})).status,401);
 assert.equal((await caller({method:'POST',authorization:'Bearer token',body:{plant_location:'NJ'}})).status,401);
 assert.equal(validSelection({company_id:'other',plant_location:'NJ'}),false);
 assert.equal(validSelection({employees:[first]}),false);
 assert.equal(toSacsEmployee(first).zkt_password,undefined);
});
test('SACS unavailable does not prevent successful ZKT; ZKT unavailable does not prevent SACS',async()=>{
 let done=0;
 let results=await runEmployeeSyncTargets(async()=>{done++;return 'ZKT DONE'},async()=>{throw Error('SACS unavailable')});
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(done,1);
 results=await runEmployeeSyncTargets(()=>{throw Error('ZKT unavailable')},async()=>{done++;return 'SACS synced'});
 assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');assert.equal(done,2);
});
