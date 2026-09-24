import test from 'node:test';
import assert from 'node:assert/strict';
import {createSacsSso} from '../server/sacsSso.mjs';
const id='57c30096-b35b-4d16-9796-0b1d14da7e30', code='a'.repeat(64);
function fixture({user={id},profile={id,role:'admin'},target=`https://sacs.test/auth/farmplast?code=${code}`}={}) {
 let calls=0;
 const query={select:()=>query,eq:()=>query,single:async()=>({data:profile})};
 const run=createSacsSso({secret:'server-only',url:'https://issuer.test/issue',adminUrl:'https://sacs.test/admin/company',allowedUserIds:id,
  clientForToken:()=>({auth:{getUser:async()=>({data:{user}})},from:()=>query}),
  fetchImpl:async(_url,opts)=>{calls++;assert.deepEqual(JSON.parse(opts.body),{source_user_id:id});return {ok:true,json:async()=>({url:target})};}});
 return {run,calls:()=>calls};
}
const req={method:'POST',authorization:'Bearer verified-token',body:{}};
test('authorized administrator receives only a fixed-origin opaque handoff URL',async()=>{
 const f=fixture();assert.deepEqual(await f.run(req),{status:200,body:{url:`https://sacs.test/auth/farmplast?code=${code}`}});assert.equal(f.calls(),1);
});
test('missing, invalid, non-allowlisted, missing-profile and non-admin callers never reach SACS',async()=>{
 for(const override of [{user:null},{user:{id:'other',user_metadata:{role:'admin'}}},{profile:null},{profile:{id,role:'user'}}]){
  const f=fixture(override);assert.ok([401,403].includes((await f.run(req)).status));assert.equal(f.calls(),0);
 }
 const f=fixture();assert.equal((await f.run({...req,authorization:null})).status,401);assert.equal(f.calls(),0);
});
test('browser cannot select a company, user, role, email or source identity',async()=>{
 const f=fixture();for(const key of ['company_id','user_id','email','role','source_user_id'])assert.equal((await f.run({...req,body:{[key]:'attacker'}})).status,400);assert.equal(f.calls(),0);
});
test('rejects unsafe destinations and upstream failures without leaking secrets',async()=>{
 for(const target of ['https://evil.test/auth/farmplast?code='+code,'https://sacs.test/login?code='+code,'https://sacs.test/auth/farmplast?code='+code+'&token=x','https://sacs.test/auth/farmplast?code=x'])assert.equal((await fixture({target}).run(req)).status,502);
});
