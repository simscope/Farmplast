import test from 'node:test';
import assert from 'node:assert/strict';
import {createSacsSso} from '../server/sacsSso.mjs';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id='57c30096-b35b-4d16-9796-0b1d14da7e30', code='a'.repeat(64);
function fixture({user={id},profile={id,role:'admin'},target=`https://sacs.test/auth/farmplast?code=${code}`}={}) {
 let calls=0;
 const run=createSacsSso({secret:'server-only',url:'https://issuer.test/issue',adminUrl:'https://sacs.test/admin/company',allowedUserIds:id,
  clientForToken:()=>({auth:{getUser:async()=>({data:{user}})},rpc:async name=>{assert.equal(name,'can_use_sacs_sso');return {data:profile?.id===id && profile.role==='admin'}}}),
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
test('role RPC sees the caller under RLS, accepts no target and denies non-admins',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table profiles(id uuid,role text); alter table profiles enable row level security;
   grant select on profiles to authenticated; grant usage on schema public,auth to authenticated;
   insert into profiles values('${id}','admin'),('11111111-1111-4111-8111-111111111111','user');`);
  await db.exec(await readFile(new URL('../../supabase/farmplast_sacs_sso.sql',import.meta.url),'utf8'));
  assert.equal((await db.query("select has_function_privilege('anon','can_use_sacs_sso()','execute') allowed")).rows[0].allowed,false);
  await db.exec(`set session authorization authenticated;set request.jwt.claim.sub='${id}';`);
  assert.equal((await db.query('select * from profiles')).rows.length,0);
  assert.equal((await db.query('select can_use_sacs_sso() allowed')).rows[0].allowed,true);
  await db.exec("set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111'");
  assert.equal((await db.query('select can_use_sacs_sso() allowed')).rows[0].allowed,false);
  await db.exec("set request.jwt.claim.sub=''");assert.equal((await db.query('select can_use_sacs_sso() allowed')).rows[0].allowed,false);
 }finally{await db.close()}
});
