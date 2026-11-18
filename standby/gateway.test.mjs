import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createGateway,restDecision} from './gateway.mjs'
test('reserve permits only reads and the explicit read RPCs; active mode is separate',()=>{
 assert.equal(restDecision('POST','/rest/v1/rpc/employee_feature_flags_status','standby'),'proxy')
 assert.equal(restDecision('POST','/rest/v1/rpc/refresh_employee_presence','standby'),'snapshot')
 for(const method of ['POST','PATCH','PUT','DELETE'])assert.equal(restDecision(method,'/rest/v1/employees','standby'),'blocked')
 assert.equal(restDecision('POST','/rest/v1/rpc/create_payroll_check','standby'),'blocked')
 assert.equal(restDecision('POST','/rest/v1/rpc/create_payroll_check','active'),'proxy')
})

test('upstream connection failures return 503 without terminating the gateway',async t=>{
 const server=http.createServer(createGateway({
  readStatus:async()=>({ready:true,mode:'standby'}),readBuild:async()=>({url:'https://reserve.invalid'}),readPhotos:async()=>({}),webRoot:os.tmpdir(),
  fetcher:async url=>{if(url.endsWith('/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});throw Error('simulated upstream failure')}
 }))
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));t.after(()=>new Promise(yes=>server.close(yes)))
 const base='http://127.0.0.1:'+server.address().port
 assert.equal((await fetch(base+'/supabase/rest/v1/employees',{headers:{Authorization:'Bearer user-token'}})).status,503)
 assert.equal((await fetch(base+'/healthz')).status,200)
 assert.equal((await fetch(base+'/supabase/auth/v1/token',{method:'POST',body:'{}'})).status,503)
 assert.equal((await fetch(base+'/healthz')).status,200)
})
test('HTTP gateway authenticates reads, blocks writes/workers/external actions, sets a photo cookie and cannot redirect REST to another host',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmplast-gateway-test-'))
 t.after(async()=>{assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(root).startsWith('farmplast-gateway-test-'));await fs.rm(root,{recursive:true})})
 await fs.writeFile(path.join(root,'index.html'),'<h1>Reserve</h1>')
 const service='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature'
 const calls=[]
 const server=http.createServer(createGateway({
  readStatus:async()=>({ready:true,mode:'standby',snapshotAt:'2026-11-17T00:00Z'}),readBuild:async()=>({url:'https://reserve.invalid'}),readPhotos:async()=>({}),webRoot:root,
  apiHandler:()=>{throw Error('External integration must not run')},
  fetcher:async(url,options)=>{
   calls.push({url,method:options.method||'GET'})
   if(url==='http://127.0.0.1:18623/user')return new Response(JSON.stringify(options.headers.Authorization==='Bearer user-token'?{id:'00000000-0000-4000-8000-000000000001'}:{}),{status:options.headers.Authorization==='Bearer user-token'?200:401})
   if(url.startsWith('http://127.0.0.1:18623/token'))return Response.json({access_token:'user-token',expires_in:3600})
   if(url==='http://127.0.0.1:18621/')return new Response('{}',{status:options.headers.Authorization==='Bearer '+service?200:401})
   assert.ok(url.startsWith('http://127.0.0.1:18621/'))
   return Response.json([{photo_url:'https://eeobivvwjzakbweluwtm.supabase.co/storage/v1/object/public/employee-photos/test.jpg'}])
  }
 }))
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));t.after(()=>new Promise(yes=>server.close(yes)))
 const base='http://127.0.0.1:'+server.address().port
 assert.equal((await fetch(base+'/supabase/rest/v1/employees')).status,401)
 const headers={Authorization:'Bearer user-token','Content-Type':'application/json'}
 const employees=await fetch(base+'/supabase/rest/v1/employees',{headers})
 assert.equal(employees.status,200);assert.match((await employees.json())[0].photo_url,/^https:\/\/reserve.invalid\//)
 const writesBefore=calls.length
 for(const route of ['/supabase/rest/v1/employees','/supabase/rest/v1/rpc/create_payroll_check','/api/sync-sacs']){
  assert.equal((await fetch(base+route,{method:'POST',headers,body:'{}'})).status,423)
 }
 assert.ok(calls.slice(writesBefore).every(call=>call.url.endsWith('/user')))
 assert.equal((await fetch(base+'/supabase/rest/v1/rpc/process_zkt_attendance_to_work_logs',{method:'POST',headers,body:'{}'})).status,200)
 assert.equal((await fetch(base+'/supabase/rest/v1/zkt_bridge_commands',{headers:{Authorization:'Bearer '+service}})).status,423)
 assert.equal((await fetch(base+'/api/reserve/bridge-health',{headers:{Authorization:'Bearer '+service}})).status,200)
 const bad='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.wrong'
 assert.equal((await fetch(base+'/api/reserve/bridge-health',{headers:{Authorization:'Bearer '+bad}})).status,401)
 const login=await fetch(base+'/supabase/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
 assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/)
 assert.equal((await fetch(base+'/supabase/rest/v1/profiles',{headers:{Cookie:'fp_payroll_reserve=user-token'}})).status,200)
 const count=calls.length
 await fetch(base+'/supabase/rest/v1@evil.invalid/employees',{headers})
 assert.equal(calls.length,count)
 assert.equal((await fetch(base+'/supabase/auth/v1/admin/users',{method:'POST',headers,body:'{}'})).status,423)
 assert.equal((await fetch(base+'/supabase/rest/v1/employees',{headers:{...headers,Origin:'https://evil.invalid'}})).status,403)
})
